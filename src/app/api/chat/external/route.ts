/**
 * External chat API for server-to-server use (e.g. deep-research).
 * POST body: { message: string, model?: string, disableLocal?: boolean }
 * Returns: { success: boolean, response?: string, error?: string }
 * No auth required. Tools use VALYU_API_KEY when set.
 */

import { runSingleMessageCompletion } from '@/lib/external-completion';

export const maxDuration = 300; // 5 minutes

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, disableLocal = true } = body as { message?: string; model?: string; disableLocal?: boolean };

    if (!message || typeof message !== 'string') {
      return Response.json(
        { success: false, error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    const text = await runSingleMessageCompletion(message, { disableLocal, timeoutMs: 300_000 });
    return Response.json({ success: true, response: text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'External completion failed';
    console.error('[Chat External]', error);
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
