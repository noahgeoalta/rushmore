export const runtime = "edge";

export async function POST(request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return new Response("ElevenLabs not configured", { status: 503 });
  }

  const { text } = await request.json();
  if (!text?.trim()) return new Response("No text", { status: 400 });

  // Strip markdown symbols and collapse whitespace
  const clean = text
    .replace(/[#*`_~\[\]()>]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 1000); // ElevenLabs free tier limit

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
        model_id: "eleven_turbo_v2_5", // fastest, lowest latency
        voice_settings: {
          stability: 0.45,        // some variation = more character
          similarity_boost: 0.82, // stay close to the voice clone
          style: 0.35,            // slight style exaggeration
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response(`ElevenLabs error: ${err}`, { status: res.status });
  }

  // Stream the audio back directly
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
