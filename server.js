//backend/server.js



import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";



dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));



const memoryPath = path.resolve("memory.json");

function loadMemory() {
  if (!fs.existsSync(memoryPath)) {
    fs.writeFileSync(memoryPath, JSON.stringify({}), "utf-8");
  }
  return JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
}

function saveMemory(memory) {
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), "utf-8");
}





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






// ✅ Lin AI Assistant Chat Endpoint with memory
app.post("/api/ai-response", async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    console.log("🧠 Incoming prompt:", prompt, "from user:", userId);

    if (!prompt || typeof prompt !== "string" || !userId) {
      return res.status(400).json({ error: "Prompt and userId are required." });
    }

    const memory = loadMemory();
    const userMessages = memory[userId] || [];

    const systemMessage = {
      role: "system",
      content: `
You are Lin, a friendly and helpful Japanese language tutor in a language learning app. Your goal is to teach real, 
useful Japanese to beginners — in a warm, natural way, like a real human tutor would speak.

Speak casually but clearly.

**Important rules:**  
- It is okay to have a normal natural conversation. But when asked about other languages. Only speak about the Japanese language.  
- Avoid sounding like an AI. Just be Lin — a real person helping someone learn Japanese from the ground up.
- Stay on the topic that the user is talking about until they change it.
- Do not answer questions about other languages.  
- Be conversational, not robotic. Like a tutor who’s kind, patient, and real.  
- Don’t list more than 4 phrases at a time — keep it light and digestible.
    `.trim()
    };

    const messages = [systemMessage, ...userMessages, { role: "user", content: prompt }];

    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content || "No reply.";

    // Save the message history (trim to last 20 messages per user)
    const updated = [...userMessages, { role: "user", content: prompt }, { role: "assistant", content: reply }];
    memory[userId] = updated.slice(-20);
    saveMemory(memory);

    console.log("✅ Reply from Lin:", reply);
    res.json({ reply });
  } catch (err) {
    console.error("❌ Fatal error in /api/ai-response:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});


app.get("/api/tts", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).send("Missing text");

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&q=${encodeURIComponent(q)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0", // 🔥 REQUIRED or Google blocks it
      }
    });

    if (!response.ok) {
      throw new Error(`Google TTS failed with status ${response.status}`);
    }

const buffer = await response.buffer();
res.set("Content-Type", "audio/mpeg");
res.send(buffer);

  } catch (err) {
    console.error("❌ TTS Proxy Error:", err);
    res.status(500).send("TTS Proxy Failed");
  }
});



// ✅ Extract Flashcards from Freeform Text (AI fallback)
app.post("/api/extract-flashcards", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Missing or invalid text." });
  }

  const prompt = `
You're a Japanese tutor. Extract all useful flashcards from the student's learning text below.

Each flashcard should include:
- "jp": the Japanese phrase or sentence
- "romaji": the pronunciation
- "en": just the core English translation (short and natural)
- "explanation": (optional) if the card needs extra cultural or usage context, include it. Only 1 card max should have an explanation per batch.

Strictly return a valid JSON array like this:
[
  { "jp": "...", "romaji": "...", "en": "...", "explanation": "..." },
  ...
]

Text:
${text}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content || "";

    const cleanJson = raw
      .replace(/^```json\s*/i, "")
      .replace(/```$/, "")
      .trim();

    const parsed = JSON.parse(cleanJson);

    if (!Array.isArray(parsed)) {
      throw new Error("Parsed data is not an array.");
    }

    res.json({ cards: parsed });
  } catch (err) {
    console.error("❌ Failed to extract flashcards:", err.message);
    res.status(500).json({ error: "Flashcard extraction failed.", details: err.message });
  }
});



// ✅ GET Memory for specific user
app.get("/api/memory", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const memory = loadMemory();
  const messages = memory[userId] || [];
  res.json({ messages });
});


const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 10000;


// ✅ Vision: Interpret Image + Prompt
app.post("/api/vision", async (req, res) => {
  const { base64Image, prompt } = req.body;

  if (!base64Image) {
    return res.status(400).json({ error: "Missing image." });
  }

  try {
    const result = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "What does this say and what does it mean in English?" },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const reply = result.choices?.[0]?.message?.content || "❌ No reply.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Vision API error:", err.message);
    res.status(500).json({ error: "Vision API failed", details: err.message });
  }
});




app.listen(PORT, HOST, () => {
  console.log(`🟢 Server running at http://${HOST}:${PORT}`);
});

