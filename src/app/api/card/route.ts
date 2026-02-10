/**
 * Generate one investor news card for a symbol.
 * POST body: { symbol: string }
 * Returns: { success: boolean, card?: { title, emoji, content }, error?: string }
 * Same format as deep-research card-from-finance. Call this on the finance app URL to get a card without calling deep-research.
 */

import { runSingleMessageCompletion } from '@/lib/external-completion';

export const dynamic = 'force-dynamic';

const CARD_PROMPT = (symbol: string) =>
  `Write a single investor news card for ${symbol} in the exact format below. Reply with ONLY a JSON object, no other text.

RULES:
- Only developments from the past 7 days. Plain English, conversational (like a smart friend over coffee). For long-term investors. No bullet points.
- Title: ONE short sentence (8-14 words), what happened and why it matters. No jargon.
- Emoji: one relevant emoji (e.g. 📰 💰 📉 🏦 🌍).
- Content: 4-6 paragraphs. Each paragraph MUST be: **bold mini-headline** (3-6 words, no period) then " - " then the paragraph content on the SAME line. Use double newlines (\\n\\n) between paragraphs. No bullet points.

Example content format:
**Here's what happened** - Bitcoin pulled back from highs as risk-off sentiment hit. ETF flows turned positive again.
**Why it matters** - For long-term holders, volatility is normal; the story is whether demand holds.
**What to watch** - Macro and regulatory headlines. If inflows persist, dips may keep getting bought.

JSON keys: "title", "emoji", "content". Example: {"title":"Bitcoin slid as risk-off hit; ETF inflows returned.","emoji":"📉","content":"**Here's what happened** - ...\\n\\n**Why it matters** - ..."}`;

export const maxDuration = 300;

export async function GET() {
  return Response.json({
    ok: true,
    message: 'Card API. POST with body: { "symbol": "AAPL" } to generate a card.',
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { symbol } = body as { symbol?: string };

    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return Response.json(
        { success: false, error: 'symbol is required' },
        { status: 400 }
      );
    }

    const ticker = symbol.trim().toUpperCase();
    const text = await runSingleMessageCompletion(CARD_PROMPT(ticker), { disableLocal: true, timeoutMs: 300_000 });

    if (!text.trim()) {
      return Response.json(
        { success: false, error: 'Empty response from model' },
        { status: 502 }
      );
    }

    let jsonStr = text.trim();
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();
    const firstBrace = jsonStr.indexOf('{');
    if (firstBrace >= 0) jsonStr = jsonStr.slice(firstBrace);
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > firstBrace) jsonStr = jsonStr.slice(0, lastBrace + 1);

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
    const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
    const emoji = typeof parsed.emoji === 'string' ? parsed.emoji.trim() || '📰' : '📰';

    if (!title || !content) {
      return Response.json(
        { success: false, error: 'Model did not return valid title and content' },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      card: { title, content, emoji, ticker },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Card generation failed';
    console.error('[Card API]', error);
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
