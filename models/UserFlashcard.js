import mongoose from "mongoose";

const UserFlashcardSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  jp: { type: String, required: true },
  romaji: String,
  en: { type: String, required: true },
  formal: String,
  audio: String,
  explanation: String,
  source: { type: String, default: "user" },
  lastReviewed: Date,
  interval: { type: Number, default: 0 },
  easeFactor: { type: Number, default: 2.5 },
  repetitions: { type: Number, default: 0 },
  status: { type: String, default: "new" }
});

export default mongoose.model("UserFlashcard", UserFlashcardSchema);
