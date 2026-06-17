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
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.25,        // low = more natural, faster, less robotic
          similarity_boost: 0.95, // stay very close to the actual voice
          style: 0.0,             // 0 = no style processing overhead, pure voice
          use_speaker_boost: true,
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
