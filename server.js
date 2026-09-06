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
app.use(express.text({ type: "application/sdp", limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SERA_RULES = `
You are SERA.

IDENTITY:
- Name: SERA
- Brand: SERA by PKR
- Developed by: Pankaj Ballyan.

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

VOICE:
- Speak naturally and conversationally.
- Use a warm, friendly feminine conversational style.
- Hindi/Hinglish with a natural Punjabi touch when appropriate.
- Do not sound robotic.
`;


// ------------------------------
// TEXT CHAT
// ------------------------------

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
    console.error("TEXT ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "SERA backend error."
      });
    } else {
      res.end();
    }
  }
});


// ------------------------------
// REALTIME VOICE
// ------------------------------

app.post("/api/realtime", async (req, res) => {
  try {
    const sdp = req.body;

    if (!sdp) {
      return res.status(400).send("SDP offer missing");
    }

    const form = new FormData();

    form.append("sdp", sdp);

    form.append(
      "session",
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1",
        audio: {
          output: {
            voice: "marin"
          }
        },
        instructions: SERA_RULES,
        output_modalities: ["audio"]
      })
    );

    const response = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: form
      }
    );

    const answer = await response.text();

    if (!response.ok) {
      console.error("REALTIME ERROR:", answer);
      return res.status(response.status).send(answer);
    }

    res.setHeader("Content-Type", "application/sdp");
    res.send(answer);

  } catch (error) {
    console.error("VOICE ERROR:", error);

    res.status(500).send(
      error.message || "Realtime voice connection failed."
    );
  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`SERA by PKR running on port ${PORT}`);
});
