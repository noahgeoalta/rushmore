export const runtime = "edge";

export async function POST(request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return new Response("ElevenLabs not configured", { status: 503 });
  }

  const { text } = await request.json();
  if (!text?.trim()) return new Response("No text", { status: 400 });

  const clean = text
    .replace(/[#*`_~\[\]()>]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 1000);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: clean,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.25,
          similarity_boost: 0.95,
          style: 0.45,        // was 0.0 — expressive/exaggerated delivery
          use_speaker_boost: true,
          speed: 1.0,         // was 1.20 — natural pace
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response(`ElevenLabs error: ${err}`, { status: res.status });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
