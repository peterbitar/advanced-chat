import { streamText, convertToModelMessages, generateId, stepCountIs } from "ai";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { financeTools } from "@/lib/tools";
import { FinanceUIMessage } from "@/lib/types";
import * as db from '@/lib/db';
import { isSelfHostedMode } from '@/lib/local-db/local-auth';

export const maxDuration = 800;

export async function POST(req: Request) {
  try {
    // Clone request for body parsing (can only read body once)
    const body = await req.json();
    const { messages, sessionId, valyuAccessToken }: { messages: FinanceUIMessage[], sessionId?: string, valyuAccessToken?: string } = body;

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "INVALID_REQUEST", message: "Messages array is required and must not be empty" },
        { status: 400 }
      );
    }
    
    const isSelfHosted = isSelfHostedMode();
    // Use getUserFromRequest to support both cookie and header auth
    const { data: { user } } = await db.getUserFromRequest(req);

    console.log("[Chat API] Request | Session:", sessionId, "| Mode:", isSelfHosted ? 'self-hosted' : 'valyu', "| User:", user?.id || 'anonymous', "| Messages:", messages.length);

    if (!isSelfHosted && !valyuAccessToken) {
      return Response.json(
        { error: "AUTH_REQUIRED", message: "Sign in with Valyu to continue. Get $10 free credits on signup!" },
        { status: 401 }
      );
    }

    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const lmstudioBaseUrl = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';
    const localEnabled = req.headers.get('x-ollama-enabled') !== 'false';
    const localProvider = (req.headers.get('x-local-provider') as 'ollama' | 'lmstudio') || 'ollama';
    const userPreferredModel = req.headers.get('x-ollama-model');

    const thinkingModels = ['deepseek-r1', 'deepseek-v3', 'deepseek-v3.1', 'qwen3', 'qwq', 'phi4-reasoning', 'phi-4-reasoning', 'cogito'];
    const preferredModels = ['deepseek-r1', 'qwen3', 'phi4-reasoning', 'cogito', 'llama3.1', 'gemma3:4b', 'gemma3', 'llama3.2', 'llama3', 'qwen2.5', 'codestral'];

    let selectedModel: any;
    let modelInfo: string;
    let supportsThinking = false;

    if (isSelfHosted && localEnabled) {
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
          const match = preferredModels.map(p => models.find((m: any) => m.name.includes(p))).find(Boolean);
          if (match) selectedModelName = match.name;
        }

        supportsThinking = thinkingModels.some(t => selectedModelName.toLowerCase().includes(t.toLowerCase()));

        const localProviderClient = createOpenAI({ baseURL, apiKey: isLMStudio ? 'lm-studio' : 'ollama' });
        selectedModel = localProviderClient.chat(selectedModelName);
        modelInfo = `${providerName} (${selectedModelName})${supportsThinking ? ' [Reasoning]' : ''} - Self-Hosted`;
      } catch (error) {
        console.error('[Chat API] Local provider error:', error);
        selectedModel = hasOpenAIKey ? openai("gpt-5.2-2025-12-11") : "openai/gpt-5.2-2025-12-11";
        modelInfo = hasOpenAIKey ? "OpenAI (gpt-5.2) - Self-Hosted Fallback" : 'Vercel AI Gateway (gpt-5.2) - Self-Hosted Fallback';
      }
    } else {
      selectedModel = hasOpenAIKey ? openai("gpt-5.2-2025-12-11") : "openai/gpt-5.2-2025-12-11";
      modelInfo = hasOpenAIKey ? "OpenAI (gpt-5.2) - Valyu Mode" : 'Vercel AI Gateway (gpt-5.2) - Valyu Mode';
    }

    console.log("[Chat API] Model:", modelInfo);
    const processingStartTime = Date.now();

    const isUsingLocalProvider = isSelfHosted && localEnabled && (modelInfo.includes('Ollama') || modelInfo.includes('LM Studio'));
    const providerOptions = {
      openai: isUsingLocalProvider
        ? { think: supportsThinking }
        : { store: true, reasoningEffort: 'low', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] }
    };

    // Save user message immediately before streaming
    if (user && sessionId && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        const { randomUUID } = await import('crypto');
        const { data: existingMessages } = await db.getChatMessages(sessionId);

        await db.saveChatMessages(sessionId, [...(existingMessages || []), {
          id: randomUUID(),
          role: 'user' as const,
          content: lastMessage.parts || [],
        }].map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
        })), user.id);

        await db.updateChatSession(sessionId, user.id, { last_message_at: new Date() });
      }
    }

    const convertedMessages = await convertToModelMessages(messages);

    const { createChart, ...toolsForRequest } = financeTools;

    const systemPrompt = `You are a helpful assistant for an API that returns TEXT ONLY. No charts, no images, no visualization tools.

Respond with plain text or markdown (bold, lists, headers). Use citations [1], [2] at the end of sentences when using search results.

**Query handling:**
- SIMPLE (e.g. "NVIDIA EPS", "Apple stock price"): One financeSearch with the exact query, then answer directly with citation. Do NOT use codeExecution for simple lookups.
- TECHNICAL INDICATORS (RSI, MACD, etc.): One financeSearch for price data only, then codeExecution to calculate, then answer.
- COMPLEX: Use full reasoning, webSearch when needed for news/context, and multiple tools as needed.

**Tools:** financeSearch, secSearch, economicsSearch, patentSearch, financeJournalSearch, polymarketSearch, webSearch, codeExecution, createCSV. Do NOT create or reference charts or images. Use webSearch for news, sentiment, and general web context when relevant.

**Calculate only when needed:** Use codeExecution ONLY when the user explicitly asks for a calculation, technical indicator (RSI, MACD, Bollinger, etc.), or computation that cannot be answered from search results alone. For simple data questions (price, EPS, revenue, etc.), use financeSearch only and answer from results.

**Citations:** Place [1], [2] only at the end of sentences. One number per source, consistent throughout.

**Code execution (when used):** Include print() statements. No visualization libraries in sandbox.

**Math:** Use <math>...</math> tags for formulas.

**CRITICAL:** After every reasoning step, call a tool or give a final answer. Never stop after reasoning alone. Max 5 parallel tool calls at a time.`;

    const result = streamText({
      model: selectedModel as any,
      messages: convertedMessages,
      tools: toolsForRequest,
      toolChoice: "auto",
      stopWhen: stepCountIs(10), // AI SDK v6: limit tool call rounds to prevent infinite loops (default is 20)
      experimental_context: {
        userId: user?.id,
        sessionId,
        valyuAccessToken, // Pass Valyu OAuth token for API proxy calls
      },
      providerOptions,
      system: systemPrompt,
    });

    const streamResponse = result.toUIMessageStreamResponse({
      sendReasoning: false,
      originalMessages: messages,
      generateMessageId: generateId,
      onFinish: async ({ messages: allMessages }) => {
        const processingTimeMs = Date.now() - processingStartTime;

        if (user && sessionId) {
          const { randomUUID } = await import('crypto');
          const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          const messagesToSave = allMessages.map((message: any, index: number) => {
            // Extract content from parts (AI SDK v5+) or legacy content field
            let contentToSave: any[] = [];
            if (message.parts && Array.isArray(message.parts)) {
              contentToSave = message.parts;
            } else if (typeof message.content === 'string') {
              contentToSave = [{ type: 'text', text: message.content }];
            } else if (Array.isArray(message.content)) {
              contentToSave = message.content;
            }

            const isLastAssistant = message.role === 'assistant' && index === allMessages.length - 1;
            return {
              id: UUID_REGEX.test(message.id || '') ? message.id : randomUUID(),
              role: message.role,
              content: contentToSave,
              processing_time_ms: isLastAssistant ? processingTimeMs : undefined,
            };
          });

          const saveResult = await db.saveChatMessages(sessionId, messagesToSave, user.id);
          if (saveResult.error) {
            console.error('[Chat API] Save error:', saveResult.error);
          } else {
            await db.updateChatSession(sessionId, user.id, { last_message_at: new Date() });
          }
        }
      }
    });

    if (isSelfHosted) {
      streamResponse.headers.set("X-Self-Hosted-Mode", "true");
    }

    return streamResponse;
  } catch (error) {
    console.error("[Chat API] Error:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred';

    const lowerMsg = errorMessage.toLowerCase();
    const isToolError = lowerMsg.includes('tool') || lowerMsg.includes('function');
    const isThinkingError = lowerMsg.includes('thinking');

    if (isToolError || isThinkingError) {
      return Response.json(
        { error: "MODEL_COMPATIBILITY_ERROR", message: errorMessage, compatibilityIssue: isToolError ? "tools" : "thinking" },
        { status: 400 }
      );
    }

    return Response.json(
      { error: "CHAT_ERROR", message: errorMessage, details: error instanceof Error ? error.stack : undefined },
      { status: 500 }
    );
  }
}

