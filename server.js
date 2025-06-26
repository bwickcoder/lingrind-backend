//backend/server.js



import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import userFlashcardRoutes from "./routes/userFlashcards.js";



dotenv.config();

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();

app.use(express.json());


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



app.use("/api/userFlashcards", userFlashcardRoutes);






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

app.listen(PORT, HOST, () => {
  console.log(`🟢 Server running at http://${HOST}:${PORT}`);
});

