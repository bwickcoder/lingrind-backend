import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const app = express();
app.use(cors({
  origin: ["http://localhost:5173", "https://your-frontend.onrender.com"],
  methods: ["GET", "POST"],
}));

app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 10000;

app.listen(PORT, HOST, () => {
  console.log(`🟢 Server running at http://${HOST}:${PORT}`);
});


// ✅ AI Assistant Chat Endpoint
app.post("/api/ai-response", async (req, res) => {
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



