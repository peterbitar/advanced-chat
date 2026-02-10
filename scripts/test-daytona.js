// Test Daytona API connection
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const { Daytona } = require('@daytonaio/sdk');

async function testDaytona() {
  console.log('Testing Daytona Configuration...\n');
  
  const apiKey = process.env.DAYTONA_API_KEY;
  const apiUrl = process.env.DAYTONA_API_URL || process.env.DAYTONA_SERVER_URL;
  const target = process.env.DAYTONA_TARGET;
  
  console.log('Configuration:');
  console.log('- DAYTONA_API_KEY:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
  console.log('- DAYTONA_API_URL:', apiUrl || 'NOT SET');
  console.log('- DAYTONA_TARGET:', target || 'NOT SET (optional)');
  console.log('');
  
  if (!apiKey) {
    console.log('❌ DAYTONA_API_KEY is not set');
    process.exit(1);
  }
  
  if (!apiUrl) {
    console.log('⚠️  DAYTONA_API_URL is not set (will use default)');
  }
  
  try {
    console.log('Creating Daytona client...');
    // Per Daytona docs: https://www.daytona.io/docs/
    // SDK default API URL is 'https://app.daytona.io/api' (not 'https://api.daytona.io')
    // Explicitly set it to override DAYTONA_API_URL from .env.local if it's wrong
    const daytonaConfig = { 
      apiKey,
      apiUrl: 'https://app.daytona.io/api', // SDK default - override incorrect .env.local value
      target: target && target !== 'latest' ? target : 'us', // Default to 'us' region if not set or 'latest'
    };
    
    console.log('Using SDK default apiUrl: https://app.daytona.io/api (overriding DAYTONA_API_URL from .env.local)');
    console.log('Using target:', daytonaConfig.target);
    
    console.log('Config:', { ...daytonaConfig, apiKey: apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET' });
    const daytona = new Daytona(daytonaConfig);
    
    console.log('Creating Python sandbox...');
    const sandbox = await daytona.create({ language: 'python' });
    console.log('✓ Sandbox created:', sandbox.id);
    
    console.log('Testing code execution...');
    const execution = await sandbox.process.codeRun('print("Hello from Daytona!")');
    console.log('✓ Code executed successfully');
    console.log('Output:', execution.result);
    console.log('Exit code:', execution.exitCode);
    
    console.log('Cleaning up...');
    await sandbox.delete();
    console.log('✓ Sandbox deleted');
    
    console.log('\n✅ Daytona is working correctly!');
  } catch (error) {
    console.error('\n❌ Daytona test failed:');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    if (error.status) {
      console.error('Status:', error.status);
    }
    process.exit(1);
  }
}

testDaytona();
