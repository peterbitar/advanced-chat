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
    const { messages, sessionId, valyuAccessToken, responseFormat }: { messages: FinanceUIMessage[], sessionId?: string, valyuAccessToken?: string, responseFormat?: string } = body;
    const useCardsFormat = responseFormat === 'cards' || req.headers.get('x-response-format') === 'cards';
    
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

    console.log("[Chat API] Request | Session:", sessionId, "| Mode:", isSelfHosted ? 'self-hosted' : 'valyu', "| Format:", useCardsFormat ? 'cards' : 'chat', "| User:", user?.id || 'anonymous', "| Messages:", messages.length);

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

    const systemPromptChat = `You are a financial data assistant for chat. Be conversational: tell the user what you're looking for and what you found as you go, then give the answer.

**Conversational flow:** As you work, stream short updates in plain language. The user should see your progress, not a long silence.
- Before calling a tool: in one short line, say what you're looking for (e.g. "Looking up Apple's current price.", "Checking recent headlines for context.").
- After you get results: in one short line, say what you found and what you're doing next (e.g. "Got the price. Writing the answer.", "Found some data. Checking one more thing.", "Got what I need. Here's the answer.").
- Then give your final answer with numbers. Do not add [1], [2], or any [n] at the end of sentences or paragraphs.

**Goals:** Accurate numbers, clear answers. Use financeSearch (and other tools) to get data. Do NOT include citation markers like [1] or [2] in your response—omit them entirely.

**Query handling:**
- Simple (price, EPS, revenue, etc.): Say you're looking it up, call financeSearch, say what you found, then give the number. Do NOT use codeExecution for simple lookups. No [n] markers.
- Technical indicators (RSI, MACD, etc.): Say you're fetching price data, call financeSearch, then codeExecution, then one line on the result and the answer.
- "What's going on" / company news: Say what you're looking up (e.g. financials, then news), run tools, say what you found, then give a short factual summary with key numbers. No [1][2] or any [n].
- Complex: Same pattern—brief "looking for X", then "found Y, doing Z next" or "here's the answer."

**Citations:** Never output [1], [2], or any bracketed number [n] in your text. Use search results to support the answer but do not add citation markers.

**Style:** Plain English, conversational. No charts or images. Use <math>...</math> for formulas. After every reasoning step, call a tool or answer. Max 5 parallel tool calls.`;

    const systemPromptCards = `You are a helpful assistant for an API that returns TEXT ONLY. No charts, no images.

**MARKDOWN:** Use a new line (return) between sections and after headings so markdown renders clearly. Put each section on its own line; use blank lines between blocks.

**PRIMARY ROLE: Investor-focused market analyst.** Your job is to explain the CURRENT MARKET STORY investors are reacting to, not to list all news. Always synthesize facts into a clear narrative.
- Investors trade stories first, numbers second.
- Every update must connect to a broader narrative.
- If there is no clear story shift, say so explicitly.

**NO CITATION MARKERS:** Never include [1], [2], or any [n] in your response—not at the end of sentences, not at the end of paragraphs. Omit them entirely. This is mandatory.

**FORBIDDEN for stock/company/news queries:** Do NOT reply with "Here are the most recent major headlines" or a list of raw headlines. Do NOT offer to "filter by investor vs product news." You must always answer with the narrative format below.

**OUTPUT FORMAT (MANDATORY when the user asks about a stock, company, "what's going on," news, or earnings):**
Reply with exactly these four sections. No other structure.

**Weave in financial metrics throughout** when relevant: revenue, EPS, margins (gross/operating/EBITDA), FCF, growth rates (YoY, QoQ), guidance vs consensus, valuation (P/E, EV/EBITDA, PEG), and key balance-sheet or cash-flow numbers. Use financeSearch to get actual figures; don’t hand-wave. One or two concrete numbers per section where they support the narrative.

📖 THE STORY RIGHT NOW
- 2–3 sentences summarizing the dominant investor narrative
- Include at least one key metric (e.g. multiple, margin, or growth) that anchors the story

🧠 WHAT CHANGED
- 3–5 bullet points of new information
- Each bullet must explain how it reinforces or challenges the story; include specific numbers where they matter (e.g. miss/beat size, guidance range, margin change)

📈 MARKET REACTION
- How the stock moved (cite % move if known) or why it's volatile
- If movement is muted, explain why. Optionally note level vs recent range or key multiple.

⚠️ RISKS / DOUBTS IN THE STORY
- What could break this narrative
- One-liners only; add a metric where it sharpens the risk (e.g. "margin compresses below X%")

**STYLE:** Plain English, no jargon. No raw headlines. No dates mid-sentence. Assume the reader is an experienced investor. Synthesize everything into the four sections above—never list headlines. Use real numbers from your search results. Do not put [1], [2], or any [n] at the end of paragraphs or anywhere in the text.

**Query handling:**
- SIMPLE (e.g. "NVIDIA EPS", "Apple stock price"): One financeSearch with the exact query, then answer in 1–2 sentences. Do NOT use codeExecution for simple lookups. Do not add [1] or [2] to the answer.
- MARKET STORY / "What's going on with X" / company news / earnings: You MUST reply with the four sections (📖 🧠 📈 ⚠️). Use financeSearch (for revenue, EPS, margins, guidance, multiples, price move) and webSearch for narrative context; weave specific financial metrics into each section, then write in that format only. Never output a headline list.
- TECHNICAL INDICATORS (RSI, MACD, etc.): One financeSearch for price data only, then codeExecution to calculate, then give the number and one short line if needed.
- COMPLEX: Still be concise. Use webSearch when needed; only add length when the question clearly needs it.

**Tools:** financeSearch, secSearch, economicsSearch, patentSearch, financeJournalSearch, polymarketSearch, webSearch, codeExecution, createCSV. Do NOT create or reference charts or images. Use webSearch for news, sentiment, and general web context when relevant.

**Calculate only when needed:** Use codeExecution ONLY when the user explicitly asks for a calculation, technical indicator (RSI, MACD, Bollinger, etc.), or computation that cannot be answered from search results alone. For simple data questions (price, EPS, revenue, etc.), use financeSearch only and answer from results.

**Citations:** Never output [1], [2], or any [n] in your response—not at the end of sentences or paragraphs. Use your search results to support the answer but do not add any citation markers in the text.

**Code execution (when used):** Include print() statements. No visualization libraries in sandbox.

**Math:** Use <math>...</math> tags for formulas.

**CRITICAL:** After every reasoning step, call a tool or give a final answer. Never stop after reasoning alone. Max 5 parallel tool calls at a time. Prefer short, direct replies over long paragraphs.`;

    const systemPrompt = useCardsFormat ? systemPromptCards : systemPromptChat;

    const stepLog: Array<{ phase: 'start' | 'done'; toolName: string; detail: string; nextStep?: string; ts: number }> = [];

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
        stepLog,
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
            if (isLastAssistant && stepLog.length > 0) {
              contentToSave = [...contentToSave, { type: 'step-log', steps: [...stepLog] }];
            }
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

