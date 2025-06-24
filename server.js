import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

app.use(express.json());





//THIS WORKS ON PC AND MOBILE!!
app.use(cors({
  origin: (origin, callback) => {
    console.log("🔎 Incoming origin:", origin);
    const allowed = [
      "http://localhost:5173",
      "https://lingrind-tailwind-starter.onrender.com",
      "capacitor://localhost",
      "https://localhost",
      "http://localhost",
      undefined, // for native mobile with no origin
      "file://" // for file-based APKs
    ];
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));









// ✅ TRANSLATION ENDPOINT
app.post("/api/translate", async (req, res) => {
  const { cards } = req.body;

  const cleanCards = (cards || [])
    .filter(c => c.jp && typeof c.jp === "string" && c.jp.trim().length > 0)
    .map(c => ({ jp: c.jp }));

  console.log("🔍 Translating", cleanCards.length, "cards");

  const BATCH_SIZE = 20;
  const allTranslations = [];

  for (let i = 0; i < cleanCards.length; i += BATCH_SIZE) {
    const batch = cleanCards.slice(i, i + BATCH_SIZE);

    const prompt = `
You are a Japanese teacher helping students build flashcards.
For each Japanese phrase, return an array of objects with this format:
[{ "jp": "...", "en": "...", "romaji": "...", "formal": "..." }]
Do not include any extra commentary or markdown code fences. Only return pure JSON.

Translate these:
${batch.map((c, j) => `${j + 1}. ${c.jp}`).join("\n")}
`.trim();

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content: prompt }],
      });

      const content = completion?.choices?.[0]?.message?.content;
      if (!content) throw new Error("No content in OpenAI response");

      const cleanJson = content
        .replace(/^```json\s*/i, "")
        .replace(/```$/, "")
        .trim();

      let parsed = JSON.parse(cleanJson);
      if (!Array.isArray(parsed)) throw new Error("Translation output was not an array");

      const valid = parsed.filter(c => c.jp && c.en);
      allTranslations.push(...valid);

      console.log(`✅ Batch ${i / BATCH_SIZE + 1}: ${valid.length} translated`);
      await new Promise(res => setTimeout(res, 1200)); // cooldown
    } catch (err) {
      console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed:`, err.message);
    }
  }

  res.json({ translated: allTranslations });
});





// ✅ Lin AI Assistant Chat Endpoint
app.post("/api/ai-response", async (req, res) => {
  try {
    const { prompt } = req.body;
    console.log("🧠 Incoming prompt:", prompt);

    if (!prompt || typeof prompt !== "string") {
      console.error("❌ Missing or invalid prompt:", prompt);
      return res.status(400).json({ error: "Prompt is required." });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
  {
    role: "system",
    content:`
You are a kind and supportive Japanese tutor inside a language learning app. Your job is to help users learn Japanese in a structured, friendly way.

Always follow this format:
1. Start with a warm, encouraging intro like:  
   “Of course! I'd be happy to teach you. How about we start with some simple greetings?”

2. Present 3–5 useful Japanese phrases with this format:  
   こんにちは (Konnichiwa) - Hello  
   おはよう (Ohayou) - Good morning  
   こんばんは (Konbanwa) - Good evening  
   ありがとうございます (Arigatou gozaimasu) - Thank you very much

3. End with a positive and motivating comment like:  
   “These will be really helpful in daily conversations. Try using them whenever you can!”

Important:
- You are only allowed to teach Japanese.  
- If the user asks about other languages or unrelated topics, politely bring the conversation back to learning Japanese.  
- Be kind, clear, and sound like a real human tutor — not a robot or dictionary.

Keep things simple and beginner-friendly. Teach one thing at a time. Make learning fun and feel personal.
      `.trim()
  },
  { role: "user", content: prompt },
],

    });

    const reply = completion?.choices?.[0]?.message?.content || "No reply.";
    console.log("✅ Reply from OpenAI:", reply);

    res.json({ reply });
  } catch (err) {
    console.error("❌ Fatal error in /api/ai-response:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});



const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 10000;

app.listen(PORT, HOST, () => {
  console.log(`🟢 Server running at http://${HOST}:${PORT}`);
});

