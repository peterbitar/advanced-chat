/**
 * External Chat API
 * 
 * This endpoint allows external applications to send messages and receive responses
 * without needing to handle streaming or complex authentication.
 * 
 * POST /api/chat/external
 * 
 * Request body:
 * {
 *   "message": "string",           // Required: The user's message
 *   "sessionId": "string",         // Optional: Session ID for conversation context
 *   "model": "openai" | "ollama",  // Optional: Model preference (default: openai)
 *   "disableLocal": boolean        // Optional: Disable local models (default: false)
 * }
 * 
 * Response:
 * {
 *   "success": boolean,
 *   "response": "string",          // The AI's response text
 *   "processingTime": number,        // Time in milliseconds
 *   "sessionId": "string",          // Session ID (new or existing)
 *   "error": "string"              // Error message if success is false
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { streamText, convertToModelMessages, generateId, stepCountIs } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { financeTools } from '@/lib/tools';
import { FinanceUIMessage } from '@/lib/types';
import * as db from '@/lib/db';
import { isSelfHostedMode } from '@/lib/local-db/local-auth';

export const maxDuration = 300; // 5 minutes max

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await req.json();
    const { 
      message, 
      sessionId: providedSessionId, 
      model = 'openai',
      disableLocal = false 
    } = body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Message is required and must be a non-empty string',
          processingTime: Date.now() - startTime
        },
        { status: 400 }
      );
    }

    const isSelfHosted = isSelfHostedMode();
    const { data: { user } } = await db.getUserFromRequest(req);

    console.log('[External Chat API] Request | Message:', message.substring(0, 50), '| Model:', model, '| Session:', providedSessionId || 'new');

    // Model selection
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const lmstudioBaseUrl = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';
    const localEnabled = !disableLocal && req.headers.get('x-ollama-enabled') !== 'false';
    const localProvider = (req.headers.get('x-local-provider') as 'ollama' | 'lmstudio') || 'ollama';
    const userPreferredModel = req.headers.get('x-ollama-model');

    let selectedModel: any;
    let modelInfo: string;
    let supportsThinking = false;

    if (isSelfHosted && localEnabled && model === 'ollama') {
      try {
        const isLMStudio = localProvider === 'lmstudio';
        const baseURL = isLMStudio ? `${lmstudioBaseUrl}/v1` : `${ollamaBaseUrl}/v1`;
        const providerName = isLMStudio ? 'LM Studio' : 'Ollama';
        const apiEndpoint = isLMStudio ? `${lmstudioBaseUrl}/v1/models` : `${ollamaBaseUrl}/api/tags`;

        const response = await fetch(apiEndpoint, { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`${providerName} API: ${response.status}`);

        const data = await response.json();
        const models = isLMStudio
          ? (data.data || []).map((m: any) => ({ name: m.id })).filter((m: any) => !m.name.includes('embed') && !m.name.includes('embedding') && !m.name.includes('nomic'))
          : (data.models || []);

        if (models.length === 0) throw new Error(`No models in ${localProvider}`);

        let selectedModelName = models[0].name;
        if (userPreferredModel && models.some((m: any) => m.name === userPreferredModel)) {
          selectedModelName = userPreferredModel;
        } else {
          const preferredModels = ['llama3.2', 'llama3', 'qwen2.5', 'codestral'];
          const match = preferredModels.map(p => models.find((m: any) => m.name.includes(p))).find(Boolean);
          if (match) selectedModelName = match.name;
        }

        const localProviderClient = createOpenAI({ baseURL, apiKey: isLMStudio ? 'lm-studio' : 'ollama' });
        selectedModel = localProviderClient.chat(selectedModelName);
        modelInfo = `${providerName} (${selectedModelName}) - Self-Hosted`;
      } catch (error) {
        console.error('[External Chat API] Local provider error:', error);
        if (!hasOpenAIKey) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'Local model unavailable and OpenAI API key not configured',
              processingTime: Date.now() - startTime
            },
            { status: 500 }
          );
        }
        selectedModel = openai("gpt-5.2-2025-12-11");
        modelInfo = "OpenAI (gpt-5.2) - Fallback";
      }
    } else {
      if (!hasOpenAIKey) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'OpenAI API key is required',
            processingTime: Date.now() - startTime
          },
          { status: 500 }
        );
      }
      selectedModel = openai("gpt-5.2-2025-12-11");
      modelInfo = "OpenAI (gpt-5.2)";
    }

    console.log("[External Chat API] Model:", modelInfo);

    // Get or create session
    let sessionId = providedSessionId;
    let isNewSession = false;
    if (!sessionId) {
      const { randomUUID } = await import('crypto');
      sessionId = randomUUID();
      isNewSession = true;
    }

    // Ensure session exists in database
    if (user && sessionId) {
      const { data: existingSession } = await db.getChatSession(sessionId, user.id);
      if (!existingSession && isNewSession) {
        // Create new session
        await db.createChatSession({
          id: sessionId,
          user_id: user.id,
          title: message.substring(0, 100), // Use first 100 chars as title
        });
      }
    }

    // Get existing messages if session exists
    let existingMessages: FinanceUIMessage[] = [];
    if (sessionId && user) {
      const { data: messages } = await db.getChatMessages(sessionId);
      if (messages) {
        existingMessages = messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          parts: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
        }));
      }
    }

    // Build messages array
    const messages: FinanceUIMessage[] = [
      ...existingMessages,
      {
        id: sessionId + '-user-' + Date.now(),
        role: 'user',
        parts: [{ type: 'text', text: message }]
      }
    ];

    // Convert to model messages
    const convertedMessages = await convertToModelMessages(messages);

    // System prompt (same as main chat API)
    const systemPrompt = `You are a helpful assistant with access to comprehensive tools for Python code execution, financial data, web search, academic research, and data visualization.

**QUERY COMPLEXITY ASSESSMENT - DYNAMIC APPROACH:**
Before responding, assess the complexity of the user's query:

**SIMPLE QUERIES** (single data point, direct lookup):
- Examples: "NVIDIA EPS", "Apple stock price", "What is Tesla revenue", "MSFT earnings", "RSI for Microsoft"
- Characteristics: Asking for ONE specific metric, short query, no extensive analysis needed
- Approach: Make ONE direct financeSearch call with the EXACT user query, then ONE codeExecution call if it's a calculation (like RSI).
- Response: Provide the answer immediately with citation [1], be conversational and straightforward.
- **CRITICAL - USE MOST RECENT DATA**: When user asks for any number, ALWAYS use the MOST RECENT data available unless they explicitly ask for historical data.
- **CRITICAL - TECHNICAL INDICATORS ARE CALCULATIONS**: For technical indicators (RSI, MACD, etc.), NEVER search for the indicator directly. Instead:
  1. Make ONE financeSearch call to get the necessary price data.
  2. Then, make ONE codeExecution call to calculate the indicator from the retrieved price data.
  3. Provide the direct answer.

**COMPLEX QUERIES** (analysis, comparisons, calculations, multi-step):
- Examples: "Compare Apple and Microsoft revenue", "Analyze Tesla's risk factors"
- Characteristics: Requires analysis, multiple data points, calculations, or comparisons
- Approach: Use full reasoning, make multiple tool calls as needed, provide comprehensive analysis.

Always use reasoning to verify you're using the correct tool and interpreting data accurately.

You can:
- Execute Python code for financial modeling, calculations, and data analysis using the codeExecution tool
- Search for financial data using the financeSearch tool
- Search SEC filings using the secSearch tool
- Search economic data using the economicsSearch tool
- Search patents using the patentSearch tool
- Search academic finance literature using the financeJournalSearch tool
- Search the web using the webSearch tool
- Search prediction markets using the polymarketSearch tool
- Create charts and visualizations using the chart creation tool

**CRITICAL**: You must only make max 5 parallel tool calls at a time.

Provide clear, conversational responses. Use citations [1], [2], etc. when referencing search results.`;

    // Generate response
    const isUsingLocalProvider = isSelfHosted && localEnabled && (modelInfo.includes('Ollama') || modelInfo.includes('LM Studio'));
    const providerOptions = {
      openai: isUsingLocalProvider
        ? { think: supportsThinking }
        : { store: true, reasoningEffort: 'medium', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] }
    };

    // Use streamText and collect the final text
    // This is more reliable than generateText when tools are involved
    const result = streamText({
      model: selectedModel as any,
      messages: convertedMessages,
      tools: financeTools,
      toolChoice: "auto",
      system: systemPrompt,
      providerOptions,
      stopWhen: stepCountIs(15), // Limit to 15 steps
    });

    // Collect the streamed text
    let responseText = '';
    for await (const chunk of result.textStream) {
      responseText += chunk;
    }

    // Wait for the stream to finish to get the full result
    const fullResult = await result;
    
    // Use the full result text if available (more complete)
    if (fullResult.text && fullResult.text.length > responseText.length) {
      responseText = fullResult.text;
    }
    
    console.log('[External Chat API] Response text length:', responseText.length);

    const processingTime = Date.now() - startTime;

    // Save messages to database
    if (user && sessionId) {
      const { randomUUID } = await import('crypto');
      
      // Save user message
      const { data: existingMessages } = await db.getChatMessages(sessionId);
      await db.saveChatMessages(sessionId, [...(existingMessages || []), {
        id: randomUUID(),
        role: 'user' as const,
        content: [{ type: 'text', text: message }],
      }].map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
      })));

      // Save assistant message
      const allMessages = [
        ...(existingMessages || []),
        {
          id: randomUUID(),
          role: 'assistant' as const,
          content: [{ type: 'text', text: responseText }],
          processing_time_ms: processingTime,
        }
      ].map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
      }));
      
      await db.saveChatMessages(sessionId, allMessages);
      await db.updateChatSession(sessionId, user.id, { last_message_at: new Date() });
    }

    // Return response
    return NextResponse.json({
      success: true,
      response: responseText,
      processingTime,
      sessionId,
      model: modelInfo,
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error("[External Chat API] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred',
        processingTime,
      },
      { status: 500 }
    );
  }
}
