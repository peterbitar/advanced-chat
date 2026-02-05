#!/usr/bin/env node
/**
 * Test chat API locally with a market-story query.
 * Run with: node scripts/test-chat-market-story.js
 * Requires: dev server running (pnpm dev), and either OPENAI_API_KEY or Valyu token.
 *
 * To use OpenAI instead of Ollama: add header x-ollama-enabled: false
 */

const BASE = process.env.CHAT_API_BASE || 'http://localhost:3000';

async function main() {
  const body = {
    messages: [
      {
        id: 'test-1',
        role: 'user',
        parts: [{ type: 'text', text: "What's going on with PayPal?" }],
      },
    ],
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-ollama-enabled': 'false', // use OpenAI so tools work (set to 'true' if you use Ollama with a tool-capable model)
  };

  console.log('POST', BASE + '/api/chat');
  console.log('Query: What\'s going on with PayPal?');
  console.log('---\n');

  const res = await fetch(BASE + '/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('HTTP', res.status, err);
    process.exit(1);
  }

  const text = await res.text();
  const lines = text.split('\n').filter((l) => l.startsWith('data: '));
  let lastText = '';

  for (const line of lines) {
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const obj = JSON.parse(data);
      const chunk =
        obj.delta ?? obj.textDelta ?? obj.text ?? (obj.type === 'message-part' && obj.part?.type === 'text' ? obj.part.text : null);
      if (chunk && typeof chunk === 'string') {
        process.stdout.write(chunk);
        lastText += chunk;
      }
      if (obj.type === 'error') {
        console.error('\nStream error:', obj.errorText || obj);
      }
    } catch (_) {}
  }

  console.log('\n---\nDone.');
  // Quick check for required sections
  const hasStory = /THE STORY RIGHT NOW/i.test(lastText);
  const hasChanged = /WHAT CHANGED/i.test(lastText);
  const hasReaction = /MARKET REACTION/i.test(lastText);
  const hasRisks = /RISKS|DOUBTS/i.test(lastText);
  if (lastText.length > 0) {
    console.log(
      'Format check:',
      hasStory && hasChanged && hasReaction && hasRisks
        ? 'OK (all 4 sections present)'
        : `Missing: ${[!hasStory && 'Story', !hasChanged && 'What changed', !hasReaction && 'Reaction', !hasRisks && 'Risks'].filter(Boolean).join(', ') || 'none'}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
