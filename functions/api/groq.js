export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json();

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: body.model || "openai/gpt-oss-120b",
      messages: body.messages,
      stream: body.stream ?? true,
      temperature: body.temperature ?? 0.7
    })
  });

  // Pipe the stream directly — preserves SSE chunks for real-time token delivery
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
