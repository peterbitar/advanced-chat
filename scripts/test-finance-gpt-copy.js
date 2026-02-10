/**
 * Test FinanceGPTCopy agent and track timing.
 * Run with: node scripts/test-finance-gpt-copy.js "Your question here"
 *
 * Requires app running (e.g. pnpm dev) and auth if not self-hosted.
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').replace(/^["']|["']$/g, '');
      const commentIdx = value.indexOf(' #');
      if (commentIdx > 0) value = value.slice(0, commentIdx).trim();
      process.env[key.trim()] = value;
    }
  });
} catch (e) {
  console.warn('No .env.local file found');
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TEST_QUERY = process.argv[2] || "What is AMD's P/E and recent news?";

async function run() {
  console.log('\n=== FinanceGPTCopy Agent Test (with timing) ===\n');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('Agent: FinanceGPTCopy (responseFormat: finance-gpt-copy)\n');
  console.log('─'.repeat(60));

  const startWall = Date.now();
  let firstTokenAt = null;
  let fullResponse = '';
  let chunkCount = 0;
  let stepTiming = null;

  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ollama-enabled': 'false',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ type: 'text', text: TEST_QUERY }] }],
        responseFormat: 'finance-gpt-copy',
      }),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const err = await response.text();
      console.log('Error:', err);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
      console.log('Unexpected Content-Type:', contentType);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'step-timing') {
            stepTiming = parsed;
            continue;
          }
          let text = '';
          if (parsed.type === 'text-delta' && parsed.textDelta) text = parsed.textDelta;
          else if (parsed.type === 'text' && parsed.text) text = parsed.text;
          else if (parsed.content) text = parsed.content;
          else if (parsed.delta) text = parsed.delta;

          if (text) {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            process.stdout.write(text);
            fullResponse += text;
            chunkCount++;
          }
        } catch (_) {
          if (data.trim()) {
            if (firstTokenAt === null) firstTokenAt = Date.now();
            process.stdout.write(data);
            fullResponse += data;
            chunkCount++;
          }
        }
      }
    }

    if (buffer.trim()) {
      if (firstTokenAt === null) firstTokenAt = Date.now();
      process.stdout.write(buffer);
      fullResponse += buffer;
      chunkCount++;
    }

    const endWall = Date.now();
    const totalMs = endWall - startWall;
    const ttfbMs = firstTokenAt !== null ? firstTokenAt - startWall : null;

    console.log('\n');
    console.log('─'.repeat(60));
    console.log('\n⏱️  Timing');
    console.log('  Total (wall):     ', totalMs, 'ms');
    if (ttfbMs !== null) console.log('  Time to first token:', ttfbMs, 'ms');
    console.log('  Chunks received:  ', chunkCount);
    console.log('  Response length:  ', fullResponse.length, 'chars');

    if (stepTiming && stepTiming.steps) {
      const totalServerMs = stepTiming.totalMs != null ? stepTiming.totalMs : totalMs;
      const byTool = {};
      for (const s of stepTiming.steps) {
        const name = s.toolName || 'unknown';
        byTool[name] = (byTool[name] || 0) + (s.elapsedMs || 0);
      }
      const toolTimeMs = Object.values(byTool).reduce((a, b) => a + b, 0);
      const otherMs = Math.max(0, totalServerMs - toolTimeMs);

      console.log('\n⏱️  Where the time went');
      console.log('  Total (server):     ', totalServerMs, 'ms', '(' + (totalServerMs / 1000).toFixed(1) + 's)');
      if (stepTiming.steps.length > 0) {
        console.log('  In tools (tracked):  ', toolTimeMs, 'ms', '(' + (toolTimeMs / 1000).toFixed(1) + 's)');
        const sorted = Object.entries(byTool).sort((a, b) => b[1] - a[1]);
        for (const [name, ms] of sorted) {
          console.log('    - ' + name + ':', ms, 'ms', '(' + (ms / 1000).toFixed(2) + 's)');
        }
        console.log('  Other (model + etc):', otherMs, 'ms', '(' + (otherMs / 1000).toFixed(1) + 's)', '— inference, streaming, overhead');
      }
    }

    console.log('\n=== Done ===\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}

run();
