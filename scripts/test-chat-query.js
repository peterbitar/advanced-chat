/**
 * Test script that sends a real query to the chat API
 * Run with: node scripts/test-chat-query.js "Your question here"
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
const TEST_QUERY = process.argv[2] || "What is the current price of Apple stock?";

async function testChatQuery() {
  console.log('\n=== Chat API Query Test ===\n');
  console.log(`Query: "${TEST_QUERY}"`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('\nSending request...\n');
  console.log('─'.repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ollama-enabled': 'false', // Use OpenAI instead of local model to avoid tool support issues
      },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          parts: [{ type: 'text', text: TEST_QUERY }]
        }]
      })
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error Response:');
      try {
        const errorJson = JSON.parse(errorText);
        console.log(JSON.stringify(errorJson, null, 2));
      } catch {
        console.log(errorText);
      }
      return;
    }

    // Check if it's a stream
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
      console.log('📡 Streaming response received:\n');
      console.log('─'.repeat(60));
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              // Handle different response formats
              if (parsed.type === 'text-delta' && parsed.textDelta) {
                process.stdout.write(parsed.textDelta);
                fullResponse += parsed.textDelta;
                chunkCount++;
              } else if (parsed.type === 'text' && parsed.text) {
                process.stdout.write(parsed.text);
                fullResponse += parsed.text;
                chunkCount++;
              } else if (parsed.content) {
                process.stdout.write(parsed.content);
                fullResponse += parsed.content;
                chunkCount++;
              } else if (parsed.delta) {
                process.stdout.write(parsed.delta);
                fullResponse += parsed.delta;
                chunkCount++;
              }
            } catch (e) {
              // Not JSON, might be plain text
              if (data.trim()) {
                process.stdout.write(data);
                fullResponse += data;
                chunkCount++;
              }
            }
          } else if (line.trim() && !line.startsWith(':')) {
            // Plain text line
            process.stdout.write(line + '\n');
            fullResponse += line + '\n';
            chunkCount++;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        process.stdout.write(buffer);
        fullResponse += buffer;
      }

      console.log('\n');
      console.log('─'.repeat(60));
      console.log(`\n✓ Response complete (${chunkCount} chunks received)`);
      console.log(`Total length: ${fullResponse.length} characters`);
      
    } else {
      // Non-streaming response
      const text = await response.text();
      console.log('Response:');
      try {
        const json = JSON.parse(text);
        console.log(JSON.stringify(json, null, 2));
      } catch {
        console.log(text);
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }

  console.log('\n=== Test Complete ===\n');
}

testChatQuery();
