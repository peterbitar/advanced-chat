#!/usr/bin/env node
/**
 * Test common investor questions against the chat API and collect answers for review.
 * Run: node scripts/test-investor-questions.js
 * Requires: dev server (pnpm dev), OPENAI_API_KEY or Valyu, x-ollama-enabled: false for tools.
 */

const BASE = process.env.CHAT_API_BASE || 'http://localhost:3000';

const QUESTIONS = [
  { id: 'simple-price', query: "What is Apple's stock price?", expect: 'simple metric, one number + brief' },
  { id: 'simple-eps', query: "What is NVIDIA's EPS?", expect: 'single metric with citation' },
  { id: 'market-story', query: "What's going on with Tesla?", expect: '4 sections 📖🧠📈⚠️ + metrics' },
  { id: 'market-story-2', query: "What's the story with Amazon?", expect: '4 sections 📖🧠📈⚠️ + metrics' },
  { id: 'why-move', query: "Why did Microsoft stock move recently?", expect: 'narrative or 4 sections, with reason + numbers' },
];

function msg(query) {
  return [{ id: '1', role: 'user', parts: [{ type: 'text', text: query }] }];
}

async function streamToText(res) {
  const text = await res.text();
  const lines = text.split('\n').filter((l) => l.startsWith('data: '));
  let out = '';
  for (const line of lines) {
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const obj = JSON.parse(data);
      const chunk = obj.delta ?? obj.textDelta ?? obj.text ?? null;
      if (chunk && typeof chunk === 'string') out += chunk;
      if (obj.type === 'error') return { error: obj.errorText || JSON.stringify(obj) };
    } catch (_) {}
  }
  return { text: out };
}

async function runOne(q) {
  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ollama-enabled': 'false' },
    body: JSON.stringify({ messages: msg(q.query) }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}: ${await res.text()}` };
  return streamToText(res);
}

function evaluate(q, result) {
  const t = (result.text || '').trim();
  const err = result.error;
  if (err) return { ok: false, reason: err };

  const isStory = q.expect.includes('4 sections');
  const hasStory = /THE STORY RIGHT NOW/i.test(t);
  const hasChanged = /WHAT CHANGED/i.test(t);
  const hasReaction = /MARKET REACTION/i.test(t);
  const hasRisks = /RISKS|DOUBTS/i.test(t);
  const hasFourSections = hasStory && hasChanged && hasReaction && hasRisks;
  const hasNumbers = /\d+\.?\d*%|\$[\d,.]+|EPS|P\/E|revenue|margin/i.test(t);
  const tooShortSimple = t.length < 25;
  const tooShortStory = t.length < 80;

  if (isStory) {
    if (!hasFourSections)
      return { ok: false, reason: `Missing sections: ${[!hasStory && 'Story', !hasChanged && 'What changed', !hasReaction && 'Reaction', !hasRisks && 'Risks'].filter(Boolean).join(', ')}` };
    if (!hasNumbers) return { ok: false, reason: 'No financial metrics in narrative' };
    if (tooShortStory) return { ok: false, reason: 'Response too short for market story' };
    return { ok: true, reason: '4 sections + metrics present' };
  }

  // Simple metric
  if (tooShortSimple) return { ok: false, reason: 'Response too short' };
  if (!hasNumbers && !/stock price|EPS|trading|share/i.test(t)) return { ok: false, reason: 'No concrete number or metric' };
  return { ok: true, reason: 'Has metric/answer' };
}

async function main() {
  console.log('Testing', QUESTIONS.length, 'investor questions at', BASE, '\n');

  const results = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`[${i + 1}/${QUESTIONS.length}] ${q.query}`);
    const result = await runOne(q);
    const evaluation = result.error ? { ok: false, reason: result.error } : evaluate(q, result);
    results.push({ question: q, result, evaluation });
    console.log(evaluation.ok ? '  ✓ ' + evaluation.reason : '  ✗ ' + evaluation.reason);
  }

  console.log('\n' + '='.repeat(80));
  console.log('ANSWERS (for manual review)\n');

  results.forEach(({ question, result, evaluation }, i) => {
    const text = result.text || result.error || '(no output)';
    const preview = text.slice(0, 600) + (text.length > 600 ? '\n... [truncated]' : '');
    console.log(`\n--- Q${i + 1}: ${question.query} ---`);
    console.log(`Expected: ${question.expect}`);
    console.log(`Verdict: ${evaluation.ok ? 'GOOD' : 'NOT GOOD'} (${evaluation.reason})`);
    console.log('\nAnswer:\n' + preview);
    console.log('\n');
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
