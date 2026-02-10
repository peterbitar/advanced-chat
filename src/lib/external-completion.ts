/**
 * Single-message completion for server-to-server / external API use.
 * Used by /api/chat/external and /api/card. No user auth; tools use VALYU_API_KEY when set.
 */

import { generateText, stepCountIs } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { financeTools } from '@/lib/tools';

const isSelfHostedMode = () => process.env.NEXT_PUBLIC_APP_MODE === 'self-hosted';

export type ExternalCompletionOptions = {
  /** Force OpenAI (no Ollama/LM Studio). Default true for external callers. */
  disableLocal?: boolean;
  /** Request timeout in ms. Default 300000 (5 min). */
  timeoutMs?: number;
};

/**
 * Run one user message through the finance model + tools and return the final text.
 * Uses OpenAI when disableLocal is true; otherwise uses same model selection as chat (self-hosted local or OpenAI).
 */
export async function runSingleMessageCompletion(
  message: string,
  options: ExternalCompletionOptions = {}
): Promise<string> {
  const { disableLocal = true, timeoutMs = 300_000 } = options;
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const lmstudioBaseUrl = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';

  const thinkingModels = ['deepseek-r1', 'deepseek-v3', 'deepseek-v3.1', 'qwen3', 'qwq', 'phi4-reasoning', 'phi-4-reasoning', 'cogito'];
  const preferredModels = ['deepseek-r1', 'qwen3', 'phi4-reasoning', 'cogito', 'llama3.1', 'gemma3:4b', 'gemma3', 'llama3.2', 'llama3', 'qwen2.5', 'codestral'];

  let selectedModel: any;

  if (disableLocal || !isSelfHostedMode()) {
    selectedModel = openai('gpt-5.2-2025-12-11');
  } else {
    try {
      const localProvider = 'ollama';
      const baseURL = `${ollamaBaseUrl}/v1`;
      const apiEndpoint = `${ollamaBaseUrl}/api/tags`;
      const response = await fetch(apiEndpoint, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`Ollama API: ${response.status}`);
      const data = await response.json();
      const models = data.models || [];
      if (models.length === 0) throw new Error('No models');
      let selectedModelName = models[0].name;
      const match = preferredModels.map((p) => models.find((m: any) => m.name.includes(p))).find(Boolean);
      if (match) selectedModelName = match.name;
      const localProviderClient = createOpenAI({ baseURL, apiKey: 'ollama' });
      selectedModel = localProviderClient.chat(selectedModelName);
    } catch {
      selectedModel = openai('gpt-5.2-2025-12-11');
    }
  }

  const { createChart, ...toolsForRequest } = financeTools;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await generateText({
      model: selectedModel,
      messages: [{ role: 'user', content: message }],
      tools: toolsForRequest,
      toolChoice: 'auto',
      stopWhen: stepCountIs(10),
      experimental_context: { valyuAccessToken: undefined },
      system: `You are a helpful financial assistant. Use the available tools to gather data when needed. Reply with the requested format only. Do not include citation markers like [1] or [2].`,
      abortSignal: controller.signal,
    });
    return result.text ?? '';
  } finally {
    clearTimeout(timeout);
  }
}
