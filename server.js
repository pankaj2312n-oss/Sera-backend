import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SERA_RULES = `
You are SERA, an independent AI assistant.

Core behavior:
- Give the best possible answer instead of stopping early with "I don't have information".
- Reason through the problem and use the information available in the conversation.
- Separate facts, assumptions, and recommendations.
- Do not invent facts. If something is uncertain, give the strongest defensible conclusion and state the uncertainty briefly.
- Do not automatically agree with the user; politely correct important mistakes.
- Be practical, direct, and helpful.
- When a question needs current information, say that current information should be verified with an appropriate tool in a later version of SERA.
- Never claim that SERA itself has feelings, experiences, or human consciousness.
`;

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Message required" });

    const input = [
      ...history.slice(-12).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: message.trim() }
    ];

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      instructions: SERA_RULES,
      input
    });

    res.json({ answer: response.output_text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERA backend error. Check the server console." });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`SERA running at http://localhost:${process.env.PORT || 3000}`);
});