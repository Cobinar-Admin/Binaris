/**
 * Binaris — Gemini fallback endpoint
 * Cloudflare Pages Function: /api/gemini
 *
 * Secret name to add in Cloudflare Dashboard → Pages → Settings → Environment Variables:
 *   GEMINI_API_KEY  (mark as "Secret / Encrypted")
 *
 * Uses the Gemini OpenAI-compatible endpoint so the SSE stream format
 * is identical to Groq — no changes needed on the frontend stream parser.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS pre-flight handled by Cloudflare automatically for same-origin Pages,
  // but add headers defensively in case the request comes from a preview URL.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const body = await request.json();

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:       body.model       || 'gemini-2.0-flash',
        messages:    body.messages,
        stream:      body.stream      ?? true,
        temperature: body.temperature ?? 0.7,
        max_tokens:  body.max_tokens  || 2048,
      }),
    }
  );

  // Pipe the SSE stream directly — same format as Groq's OpenAI-compat endpoint
  return new Response(response.body, {
    status: response.status,
    headers: {
      ...corsHeaders,
      'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

// Handle CORS pre-flight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
