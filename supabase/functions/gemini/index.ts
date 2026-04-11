import { serve } from "https://deno.land/std/http/server.ts";

// ✅ Read Gemini key securely
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")?.trim();

// ✅ CORS headers
const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // ✅ Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: BASE_HEADERS });
  }

  console.log("🚀 Gemini function called");

  // ❌ No manual auth checks here
  // Supabase automatically validates JWT from Authorization header

  if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not set");
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: BASE_HEADERS }
    );
  }

  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "No prompt provided" }),
        { status: 400, headers: BASE_HEADERS }
      );
    }

    console.log("📝 Prompt received, calling Gemini...");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await res.json();

    if (data.error) {
      console.error("❌ Gemini error:", data.error);
      return new Response(
        JSON.stringify({ error: data.error.message || "Gemini API error" }),
        { status: 400, headers: BASE_HEADERS }
      );
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini";

    console.log("✅ Gemini response received");

    return new Response(
      JSON.stringify({ reply }),
      { headers: BASE_HEADERS }
    );
  } catch (err) {
    console.error("❌ Function error:", err);

    return new Response(
      JSON.stringify({ error: "Function failed" }),
      { status: 500, headers: BASE_HEADERS }
    );
  }
});