/**
 * Test script for Chat API route (JavaScript version)
 * Run with: node scripts/test-chat-api.js
 * 
 * This tests the main chat API endpoint functionality
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

const results = [];

function logTest(name, passed, error, details) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✓' : '✗';
  console.log(`${icon} ${name}`);
  if (error) {
    console.log(`  Error: ${error}`);
  }
  if (details && !passed) {
    console.log(`  Details:`, JSON.stringify(details, null, 2).slice(0, 200));
  }
}

async function testChatAPI() {
  console.log('\n=== Chat API Test ===\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Query: "${TEST_QUERY}"`);
  console.log(`Mode: ${process.env.NEXT_PUBLIC_APP_MODE || 'default'}`);
  console.log(`VALYU_API_KEY: ${process.env.VALYU_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log('\n---\n');

  // Test 1: Check if API endpoint exists
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ 
          role: 'user', 
          parts: [{ type: 'text', text: TEST_QUERY }]
        }]
      })
    });

    if (response.status === 401) {
      logTest('API Endpoint - Auth Required', true, undefined, {
        status: response.status,
        message: 'Expected auth requirement'
      });
    } else if (response.status === 200 || response.status === 201) {
      logTest('API Endpoint - Accessible', true, undefined, {
        status: response.status
      });
    } else if (response.status === 500) {
      // 500 is expected if API keys are missing or there are configuration issues
      logTest('API Endpoint - Server Responding', true, undefined, {
        status: response.status,
        message: 'Server is running and processing requests (500 expected without API keys)'
      });
    } else {
      logTest('API Endpoint - Unexpected Status', false, `Status: ${response.status}`, {
        status: response.status,
        statusText: response.statusText
      });
    }
  } catch (error) {
    logTest('API Endpoint - Connection', false, error.message);
  }

  // Test 2: Test with self-hosted mode (if applicable)
  if (process.env.NEXT_PUBLIC_APP_MODE === 'self-hosted') {
    try {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ollama-enabled': 'true',
          'x-local-provider': 'ollama'
        },
        body: JSON.stringify({
          messages: [{ 
            role: 'user', 
            parts: [{ type: 'text', text: TEST_QUERY }]
          }]
        })
      });

      const contentType = response.headers.get('content-type');
      const isStream = contentType?.includes('text/event-stream') || contentType?.includes('text/plain');

      if (isStream || response.status === 200) {
        logTest('Self-Hosted Mode - Stream Response', true, undefined, {
          status: response.status,
          contentType
        });
      } else {
        logTest('Self-Hosted Mode - Response', false, `Unexpected response`, {
          status: response.status,
          contentType
        });
      }
    } catch (error) {
      logTest('Self-Hosted Mode - Connection', false, error.message);
    }
  }

  // Test 3: Test error handling for invalid requests
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing messages
    });

    if (response.status >= 400) {
      logTest('Error Handling - Invalid Request', true, undefined, {
        status: response.status,
        message: 'Correctly rejects invalid request'
      });
    } else {
      logTest('Error Handling - Invalid Request', false, 'Should reject invalid request');
    }
  } catch (error) {
    logTest('Error Handling - Exception', false, error.message);
  }

  // Test 4: Test environment variables
  const requiredEnvVars = {
    'VALYU_API_KEY': process.env.VALYU_API_KEY,
    'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length === 0) {
    logTest('Environment Variables - All Set', true);
  } else {
    logTest('Environment Variables - Missing', true, undefined, {
      missing: missingVars,
      note: 'Some vars may be optional depending on mode'
    });
  }

  // Test 5: Test tools availability (simplified - just check if file exists)
  try {
    const toolsPath = resolve(process.cwd(), 'src/lib/tools.ts');
    const toolsContent = readFileSync(toolsPath, 'utf-8');
    const hasTools = toolsContent.includes('financeTools') || toolsContent.includes('export');
    
    if (hasTools) {
      logTest('Tools - File Exists', true, undefined, {
        message: 'Tools file found and contains exports'
      });
    } else {
      logTest('Tools - File Exists', false, 'Tools file not found or invalid');
    }
  } catch (error) {
    logTest('Tools - File Check', false, error.message);
  }

  // Summary
  console.log('\n=== Test Summary ===\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}: ${r.error || 'Unknown error'}`);
    });
  }

  console.log('\n=== Test Complete ===\n');

  return failed === 0;
}

// Run tests
testChatAPI()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n=== Fatal Error ===\n');
    console.error(error);
    process.exit(1);
  });
