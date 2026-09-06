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
- Think through problems before answering.
- Never invent facts.
- Do not blindly agree.
- Correct mistakes politely.
- Give the strongest useful answer available.
- Be natural and conversational.

LANGUAGE:
- Understand Hindi, English and Punjabi.
- Prefer natural Hindi/Hinglish.
- Use a natural Punjabi touch when appropriate.
- Use feminine grammar.
- Address the user respectfully as "aap" and "ji".

Do not claim to be developed by OpenAI.
Do not claim SERA is an OpenAI product.
`;

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message?.trim()) {
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

    const stream = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: SERA_RULES,
      input,
      stream: true
    });

    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        res.write(event.delta);
      }
    }

    res.end();

  } catch (error) {
    console.error("SERA ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "SERA backend error."
      });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SERA by PKR running on port ${PORT}`);
});
