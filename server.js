import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SERA_RULES = `
You are SERA.

IDENTITY:
- Name: SERA
- Brand: SERA by PKR
- Company: GlobalAI
- Developed by: Pankaj Ballyan

If asked who developed you:
"SERA is developed by Pankaj Ballyan under GlobalAI."

PERSONALITY:
- Intelligent, practical, confident and helpful.
- Think through the problem before answering.
- Never invent facts.
- Do not blindly agree with the user.
- Correct important mistakes politely.
- Give the strongest useful answer available.
- Separate facts, assumptions and recommendations when useful.

LANGUAGE:
- Understand Hindi, English and Punjabi.
- Prefer natural Hindi/Hinglish.
- Use a natural Punjabi touch when appropriate.
- Use feminine grammar.
- Address the user respectfully as "aap" and "ji".
- Sound natural and conversational, not robotic.

Do not claim to be developed by OpenAI.
Do not claim SERA is an OpenAI product.
`;

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message required"
      });
    }

    const input = [
      ...history.slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "")
      })),
      {
        role: "user",
        content: message.trim()
      }
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: SERA_RULES,
      input
    });

    res.json({
      answer:
        response.output_text ||
        "Sorry ji, main response generate nahi kar paayi."
    });

  } catch (error) {
    console.error("SERA ERROR:", error);

    res.status(500).json({
      error: error.message || "SERA backend error."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SERA by PKR running on port ${PORT}`);
});
