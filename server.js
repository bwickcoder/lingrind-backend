import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const app = express();

app.use(express.json());


app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://lingrind-tailwind-starter.onrender.com",
    "https://lingrind-server.onrender.com",
    "capacitor://localhost"
  ];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});




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





// ✅ AI Assistant Chat Endpoint
app.post("/api/ai-response", async (req, res) => {
  console.log("🧠 Incoming request body:", req.body);
  console.log("🔑 OPENAI_API_KEY exists:", !!process.env.OPENAI_API_KEY);
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    const reply = completion?.choices?.[0]?.message?.content || "No reply.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Error in /api/ai-response:", err.message);
    res.status(500).json({ error: "Failed to contact AI." });
  }
});


const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 10000;

app.listen(PORT, HOST, () => {
  console.log(`🟢 Server running at http://${HOST}:${PORT}`);
});

