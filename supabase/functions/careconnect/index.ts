import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// supabase-js also sends x-client-info and apikey; they must be allowed or the browser
// blocks the request at the CORS preflight.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Every response (errors included) needs the CORS headers, otherwise the browser hides
// the real error behind a generic network failure.
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, language } = await req.json();

    if (!prompt) {
      return json({ error: "No prompt provided" }, 400);
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    const systemInstruction = language === "ta"
      ? "You are CareConnect, a warm post-discharge care assistant. Respond entirely in Tamil (தமிழ்). Speak with empathy. Never give emergency medical advice — direct serious symptoms to the hospital immediately."
      : "You are CareConnect, a warm and knowledgeable post-discharge care assistant. Speak clearly with empathy and reassurance. Never give emergency medical advice — always direct serious symptoms to emergency contacts or the hospital immediately.";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            { role: "user", parts: [{ text: prompt }] },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return json({ error: data.error?.message || "Gemini API error" }, 502);
    }

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response";

    return json({ reply });

  } catch (err) {
    console.error("Edge function error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
