/**
 * Check if API keys are properly configured in .env.local
 * Run with: node scripts/check-env-keys.js
 */

const { readFileSync } = require('fs');
const { resolve } = require('path');

try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  
  console.log('\n=== Environment Variables Check ===\n');
  
  const lines = envContent.split('\n');
  const keys = {
    'VALYU_API_KEY': null,
    'DAYTONA_API_KEY': null,
    'OPENAI_API_KEY': null,
  };
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      const keyName = key.trim();
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      
      if (keys.hasOwnProperty(keyName)) {
        keys[keyName] = {
          value: value,
          hasValue: value.length > 0,
          line: index + 1,
          raw: trimmed.substring(0, 50) + (trimmed.length > 50 ? '...' : '')
        };
      }
    }
  });
  
  let allGood = true;
  
  for (const [keyName, info] of Object.entries(keys)) {
    if (!info) {
      console.log(`✗ ${keyName}: Not found in .env.local`);
      allGood = false;
    } else if (!info.hasValue) {
      console.log(`✗ ${keyName}: Found but EMPTY (line ${info.line})`);
      console.log(`  Raw: ${info.raw}`);
      allGood = false;
    } else {
      const masked = info.value.substring(0, 8) + '...' + info.value.substring(info.value.length - 4);
      console.log(`✓ ${keyName}: Present (${info.value.length} chars)`);
      console.log(`  Preview: ${masked}`);
    }
  }
  
  console.log('\n=== Summary ===\n');
  
  if (allGood) {
    console.log('✓ All required keys are present and have values!');
    console.log('\nIf the dialog still shows, try:');
    console.log('1. Make sure the dev server is restarted');
    console.log('2. Hard refresh the browser (Cmd+Shift+R or Ctrl+Shift+R)');
    console.log('3. Clear browser cache');
  } else {
    console.log('✗ Some keys are missing or empty.');
    console.log('\nTo fix:');
    console.log('1. Open .env.local in your editor');
    console.log('2. Make sure each key has a value after the = sign');
    console.log('3. No quotes needed (unless the key itself contains special chars)');
    console.log('4. No spaces around the = sign');
    console.log('5. Each key on its own line');
    console.log('\nExample format:');
    console.log('VALYU_API_KEY=vy_live_abc123xyz789');
    console.log('DAYTONA_API_KEY=dt_abc123xyz789');
  }
  
  console.log('\n');
  
} catch (error) {
  console.error('Error reading .env.local:', error.message);
  console.log('\nMake sure .env.local exists in the project root directory.');
}
