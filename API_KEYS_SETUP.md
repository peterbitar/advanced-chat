# API Keys Setup Guide

This guide explains what API keys you need and where to configure them.

## Quick Setup (Self-Hosted Mode - Recommended)

Create a `.env.local` file in the root directory of your project with the following keys:

## Required API Keys

### 1. VALYU_API_KEY (Required)
**What it's for:** Powers all search functionality (SEC filings, financial data, web search, patents, etc.)

**Where to get it:**
- Visit [platform.valyu.ai](https://platform.valyu.ai)
- Sign up for an account
- Navigate to API Keys section
- Create a new API key
- Copy the key

**Add to .env.local:**
```env
VALYU_API_KEY=your-valyu-api-key-here
```

### 2. DAYTONA_API_KEY (Required for Python Code Execution)
**What it's for:** Enables Python code execution in secure sandboxes (for financial modeling, calculations, ML)

**Where to get it:**
- Visit [daytona.io](https://daytona.io)
- Sign up for an account
- Navigate to API Keys or Settings
- Create a new API key
- Copy the key

**Add to .env.local:**
```env
DAYTONA_API_KEY=your-daytona-api-key-here
DAYTONA_API_URL=https://api.daytona.io  # Optional, defaults to this
DAYTONA_TARGET=latest  # Optional
```

## Optional API Keys

### 3. OPENAI_API_KEY (Optional - Fallback)
**What it's for:** Fallback LLM provider if local models (Ollama/LM Studio) are unavailable

**Where to get it:**
- Visit [platform.openai.com](https://platform.openai.com)
- Sign up/login
- Go to API Keys section
- Create a new secret key
- Copy the key

**Add to .env.local:**
```env
OPENAI_API_KEY=your-openai-api-key-here
```

**Note:** If you're using Ollama or LM Studio for local models, you don't need this.

## Local LLM Configuration (Optional but Recommended)

### 4. OLLAMA_BASE_URL (Optional)
**What it's for:** Use local Ollama models for unlimited, private queries (no API costs!)

**Setup:**
1. Install Ollama from [ollama.com](https://ollama.com)
2. Download a model: `ollama pull qwen2.5:7b`
3. Start Ollama (usually runs automatically)

**Add to .env.local:**
```env
OLLAMA_BASE_URL=http://localhost:11434  # Default, usually don't need to set
```

### 5. LMSTUDIO_BASE_URL (Optional - Alternative to Ollama)
**What it's for:** Use LM Studio GUI for local models (alternative to Ollama)

**Setup:**
1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Download a model through the GUI
3. Start the server (click menu bar icon → "Start Server")

**Add to .env.local:**
```env
LMSTUDIO_BASE_URL=http://localhost:1234  # Default, usually don't need to set
```

## Complete .env.local Example

Here's a complete example for self-hosted mode:

```env
# Enable Self-Hosted Mode (No Supabase, No Auth, No Billing)
NEXT_PUBLIC_APP_MODE=self-hosted

# Required: Valyu API for searches
VALYU_API_KEY=vy_live_xxxxxxxxxxxxxxxxxxxxx

# Required: Daytona API for Python code execution
DAYTONA_API_KEY=dt_xxxxxxxxxxxxxxxxxxxxx

# Optional: OpenAI API (fallback if no local models)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx

# Optional: Local LLM Configuration
OLLAMA_BASE_URL=http://localhost:11434
LMSTUDIO_BASE_URL=http://localhost:1234
```

## Where to Put the File

1. Create `.env.local` in the **root directory** of your project:
   ```
   /Users/peter/projects/Github/finance/.env.local
   ```

2. Add all your API keys to this file

3. **Important:** Never commit `.env.local` to git (it's already in .gitignore)

## Verification

After setting up your `.env.local` file:

1. Restart your dev server:
   ```bash
   # Stop the current server (Ctrl+C)
   pnpm dev
   ```

2. Run the test script to verify:
   ```bash
   node scripts/test-chat-api.js
   ```

3. You should see:
   - ✓ VALYU_API_KEY: ✓ Set
   - ✓ OPENAI_API_KEY: ✓ Set (if you added it)
   - ✓ All tests passing

## What Each Key Does

| Key | Purpose | Required? | Cost |
|-----|---------|-----------|------|
| `VALYU_API_KEY` | All search functionality (SEC, finance, web, patents) | ✅ Yes | Pay-per-use |
| `DAYTONA_API_KEY` | Python code execution in sandboxes | ✅ Yes | Pay-per-use |
| `OPENAI_API_KEY` | LLM responses (if not using local models) | ⚠️ Optional | Pay-per-use |
| `OLLAMA_BASE_URL` | Local LLM (unlimited, free, private) | ⚠️ Optional | Free |
| `LMSTUDIO_BASE_URL` | Local LLM via GUI (unlimited, free, private) | ⚠️ Optional | Free |

## Troubleshooting

### "VALYU_API_KEY not set"
- Make sure `.env.local` exists in the root directory
- Check that the key is on a single line (no line breaks)
- Restart your dev server after adding keys

### "API endpoint returning 500"
- Check that VALYU_API_KEY is valid
- Verify the key hasn't expired
- Check server logs for specific error messages

### "Code execution not working"
- Verify DAYTONA_API_KEY is set correctly
- Check that Daytona service is accessible
- Review Daytona API documentation

### "Local models not detected"
- Make sure Ollama or LM Studio is running
- Check that models are downloaded
- Verify the base URL is correct (defaults are usually fine)

## Need Help?

- Valyu API: [platform.valyu.ai](https://platform.valyu.ai) or contact@valyu.ai
- Daytona API: [daytona.io](https://daytona.io)
- OpenAI API: [platform.openai.com](https://platform.openai.com)
- Ollama: [ollama.com](https://ollama.com)
- LM Studio: [lmstudio.ai](https://lmstudio.ai)
