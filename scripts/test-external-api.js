/**
 * Test script for External Chat API
 * 
 * Usage: node scripts/test-external-api.js "Your message here"
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
const TEST_MESSAGE = process.argv[2] || "What is the current price of Apple stock?";

async function testExternalAPI() {
  console.log('\n=== Testing External Chat API ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Message: "${TEST_MESSAGE}"\n`);

  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/chat/external`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: TEST_MESSAGE,
        model: 'openai', // or 'ollama' for local models
        disableLocal: true, // Force OpenAI
      }),
    });

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`Status: ${response.status}`);
    console.log(`Response Time: ${elapsed}s\n`);

    if (data.success) {
      console.log('✅ SUCCESS\n');
      console.log(`Session ID: ${data.sessionId}`);
      console.log(`Model: ${data.model}`);
      console.log(`Processing Time: ${data.processingTime}ms\n`);
      console.log('Response:');
      console.log('─'.repeat(60));
      const responseText = data.response || '(empty response)';
      console.log(responseText);
      console.log('─'.repeat(60));
      console.log(`\nResponse length: ${responseText.length} characters`);
      if (responseText.length === 0) {
        console.log('\n⚠️  WARNING: Response is empty!');
        console.log('Full response object:', JSON.stringify(data, null, 2));
      }
    } else {
      console.log('❌ ERROR\n');
      console.log(`Error: ${data.error}`);
      console.log(`Processing Time: ${data.processingTime}ms`);
    }

    return data.success;
  } catch (error) {
    console.error('\n❌ Request failed:');
    console.error(error.message);
    return false;
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
  const success = await testExternalAPI();
  process.exit(success ? 0 : 1);
})();
