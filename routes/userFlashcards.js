import express from "express";
import UserFlashcard from "../models/UserFlashcard.js";

const router = express.Router();

// 🔹 GET all user flashcards
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const cards = await UserFlashcard.find({ userId });
  res.json(cards);
});

// 🔹 POST new flashcards (array)
router.post("/", async (req, res) => {
  const { userId, cards } = req.body;
  if (!userId || !Array.isArray(cards)) return res.status(400).json({ error: "Invalid data" });

  let added = 0;

  for (let card of cards) {
    const exists = await UserFlashcard.findOne({ userId, jp: card.jp, en: card.en });
    if (!exists) {
      await UserFlashcard.create({ ...card, userId });
      added++;
    }
  }

  res.json({ message: `Added ${added} new card(s)` });
});

// 🔹 DELETE one card
router.delete("/", async (req, res) => {
  const { userId, jp } = req.body;
  if (!userId || !jp) return res.status(400).json({ error: "Missing data" });

  await UserFlashcard.deleteOne({ userId, jp });
  res.json({ message: "Card deleted" });
});

export default router;
