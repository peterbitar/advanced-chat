/**
 * Test script for Microsoft RSI query
 * Tests the full flow: financeSearch -> codeExecution -> RSI result
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

// Load .env.local manually
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
const TEST_QUERY = "RSI for Microsoft";

async function testRSIQuery() {
  console.log('\n=== Testing Microsoft RSI Query ===\n');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Base URL: ${BASE_URL}\n`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Disable local models to use OpenAI (which supports tools)
        'x-ollama-enabled': 'false'
      },
      body: JSON.stringify({
        messages: [{ 
          role: 'user', 
          parts: [{ type: 'text', text: TEST_QUERY }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText.slice(0, 500)}`);
      process.exit(1);
    }

    const contentType = response.headers.get('content-type');
    const isStream = contentType?.includes('text/event-stream');
    
    console.log(`✓ Response received (${response.status})`);
    console.log(`Content-Type: ${contentType}`);
    console.log(`Streaming: ${isStream ? 'Yes' : 'No'}\n`);

    if (isStream) {
      console.log('Reading stream...\n');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasToolCall = false;
      let hasFinanceSearch = false;
      let hasCodeExecution = false;
      let hasRSIResult = false;
      let fullText = '';
      let chunkCount = 0;
      let lastLogTime = Date.now();
      let rawLines = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkCount++;
        const now = Date.now();
        if (now - lastLogTime > 5000) {
          console.log(`  ... still streaming (${chunkCount} chunks, ${((now - startTime) / 1000).toFixed(1)}s)`);
          lastLogTime = now;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            rawLines.push(line);
            // Show first few lines for debugging
            if (rawLines.length <= 5) {
              console.log(`  [${rawLines.length}] ${line.slice(0, 100)}`);
            }
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Check for tool calls (AI SDK format)
              if (data.type === 'tool-call' || data.toolCallId || data.toolName || data.name) {
                hasToolCall = true;
                const toolName = data.toolName || data.name || '';
                if (toolName === 'financeSearch' || toolName.includes('finance')) {
                  hasFinanceSearch = true;
                  console.log('✓ financeSearch tool called');
                }
                if (toolName === 'codeExecution' || toolName.includes('code') || toolName.includes('execution')) {
                  hasCodeExecution = true;
                  console.log('✓ codeExecution tool called');
                }
              }
              
              // Check for text content (AI SDK format)
              if (data.type === 'text-delta' || data.type === 'text' || data.type === 'tool-result') {
                const text = data.textDelta || data.text || data.result || JSON.stringify(data);
                fullText += text;
                if (text.toLowerCase().includes('rsi') || text.toLowerCase().includes('relative strength')) {
                  hasRSIResult = true;
                }
              }
              
              // Also check the raw data for any mentions
              const dataStr = JSON.stringify(data).toLowerCase();
              if (dataStr.includes('finance') && dataStr.includes('search')) {
                hasFinanceSearch = true;
              }
              if (dataStr.includes('code') && dataStr.includes('execution')) {
                hasCodeExecution = true;
              }
              if (dataStr.includes('rsi')) {
                hasRSIResult = true;
              }
            } catch (e) {
              // Not JSON, check if line contains relevant info
              const lowerLine = line.toLowerCase();
              if (lowerLine.includes('finance') && lowerLine.includes('search')) {
                hasFinanceSearch = true;
              }
              if (lowerLine.includes('code') && lowerLine.includes('execution')) {
                hasCodeExecution = true;
              }
              if (lowerLine.includes('rsi')) {
                hasRSIResult = true;
                fullText += line;
              }
            }
          } else if (line.trim()) {
            // Also check non-data lines
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('rsi') || lowerLine.includes('relative strength')) {
              hasRSIResult = true;
              fullText += line;
            }
          }
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`\n  Total chunks: ${chunkCount}`);
      console.log(`  Total lines: ${rawLines.length}`);
      
      console.log('\n=== Results ===\n');
      console.log(`Time elapsed: ${elapsed}s`);
      console.log(`Tool calls detected: ${hasToolCall ? 'Yes' : 'No'}`);
      console.log(`financeSearch called: ${hasFinanceSearch ? '✓ Yes' : '✗ No'}`);
      console.log(`codeExecution called: ${hasCodeExecution ? '✓ Yes' : '✗ No'}`);
      console.log(`RSI result in response: ${hasRSIResult ? '✓ Yes' : '✗ No'}`);
      
      if (rawLines.length > 0) {
        console.log(`\nFirst 10 stream lines:`);
        rawLines.slice(0, 10).forEach((line, i) => {
          console.log(`  [${i+1}] ${line.slice(0, 150)}`);
        });
      }
      
      if (fullText.length > 0) {
        console.log(`\nResponse preview (first 500 chars):`);
        console.log(fullText.slice(0, 500) + '...');
      }

      console.log('\n=== Test Summary ===\n');
      
      if (hasFinanceSearch && hasCodeExecution && hasRSIResult) {
        console.log('✅ SUCCESS: Full RSI flow completed correctly!');
        console.log('   - financeSearch called to get price data');
        console.log('   - codeExecution called to calculate RSI');
        console.log('   - RSI result included in response');
        if (parseFloat(elapsed) < 60) {
          console.log(`   - Response time: ${elapsed}s (good!)`);
        } else {
          console.log(`   - Response time: ${elapsed}s (slow, but acceptable)`);
        }
        process.exit(0);
      } else {
        console.log('⚠️  PARTIAL: Some steps may be missing');
        if (!hasFinanceSearch) console.log('   ✗ financeSearch not detected');
        if (!hasCodeExecution) console.log('   ✗ codeExecution not detected');
        if (!hasRSIResult) console.log('   ✗ RSI result not found in response');
        process.exit(1);
      }
    } else {
      const text = await response.text();
      console.log('Response (non-stream):');
      console.log(text.slice(0, 1000));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/env-status`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Main
(async () => {
  console.log('Checking if server is running...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error(`\n❌ Server is not running at ${BASE_URL}`);
    console.error('Please start the server with: npm run dev');
    process.exit(1);
  }
  
  console.log('✓ Server is running\n');
  await testRSIQuery();
})();
