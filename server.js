import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const { Pool } = pg;

const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});


// ------------------------------
// DATABASE
// ------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});


// Create required tables automatically
async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not configured.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS consents (
      user_id TEXT PRIMARY KEY,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consent_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS training_examples (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      question TEXT NOT NULL,
      ideal_answer TEXT,
      feedback TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS conversations_session_idx
    ON conversations(session_id, created_at);

    CREATE INDEX IF NOT EXISTS training_status_idx
    ON training_examples(status, created_at);
  `);

  console.log("Database ready.");
}


// ------------------------------
// EXPRESS
// ------------------------------

app.use(express.json({ limit: "1mb" }));
app.use(express.text({
  type: "application/sdp",
  limit: "2mb"
}));

app.use(express.static(path.join(__dirname, "public")));


// ------------------------------
// SERA RULES
// ------------------------------

const SERA_RULES = `
You are SERA.

IDENTITY:
- Name: SERA.
- Brand: SERA by PKR.
- Developed by Pankaj Ballyan.

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

CORE RULE:
Never stop at "I don't know".
Think through every available path and provide the most useful answer possible.

VOICE:
- Speak naturally and conversationally.
- Use a warm feminine conversational style.
- Hindi/Hinglish with a natural Punjabi touch when appropriate.
- Do not sound robotic.
`;


// ------------------------------
// HEALTH CHECK
// ------------------------------

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      sera: "online",
      database: "connected"
    });

  } catch (error) {
    console.error("HEALTH ERROR:", error);

    res.status(500).json({
      ok: false,
      sera: "online",
      database: "error"
    });
  }
});


// ------------------------------
// REGISTER / CONSENT
// ------------------------------

app.post("/api/register", async (req, res) => {
  try {
    const { consent } = req.body;

    if (consent !== true) {
      return res.status(400).json({
        error: "Training consent is required."
      });
    }

    const userId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO consents
      (user_id, consent_version)
      VALUES ($1, $2)
      `,
      [userId, "2026-09-06"]
    );

    res.json({
      ok: true,
      user_id: userId
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);

    res.status(500).json({
      error: "Unable to register user."
    });
  }
});


// ------------------------------
// TEXT CHAT
// ------------------------------

app.post("/api/chat", async (req, res) => {
  try {

    const {
      message,
      history = [],
      user_id,
      session_id
    } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        error: "Message required."
      });
    }

    if (!user_id) {
      return res.status(401).json({
        error: "Please complete SERA training consent first."
      });
    }

    // Verify consent
    const consentResult = await pool.query(
      `
      SELECT user_id
      FROM consents
      WHERE user_id = $1
      `,
      [user_id]
    );

    if (consentResult.rowCount === 0) {
      return res.status(403).json({
        error: "Training consent not found."
      });
    }

    const currentSession =
      session_id || crypto.randomUUID();

    const cleanMessage = message.trim();

    // Save user message
    await pool.query(
      `
      INSERT INTO conversations
      (session_id, user_id, role, content)
      VALUES ($1, $2, 'user', $3)
      `,
      [
        currentSession,
        user_id,
        cleanMessage
      ]
    );

    const input = [
      ...history.slice(-12).map((m) => ({
        role:
          m.role === "assistant"
            ? "assistant"
            : "user",
        content: String(m.content || "")
      })),
      {
        role: "user",
        content: cleanMessage
      }
    ];

    const stream = await client.responses.create({
      model:
        process.env.OPENAI_MODEL ||
        "gpt-5.6-luna",

      instructions: SERA_RULES,

      input,

      stream: true
    });

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    let assistantAnswer = "";

    for await (const event of stream) {

      if (
        event.type ===
        "response.output_text.delta"
      ) {

        assistantAnswer += event.delta;

        res.write(event.delta);
      }
    }

    // Save assistant answer
    if (assistantAnswer.trim()) {

      await pool.query(
        `
        INSERT INTO conversations
        (session_id, user_id, role, content)
        VALUES ($1, $2, 'assistant', $3)
        `,
        [
          currentSession,
          user_id,
          assistantAnswer
        ]
      );
    }

    res.end();

  } catch (error) {

    console.error(
      "TEXT ERROR:",
      error
    );

    if (!res.headersSent) {

      res.status(500).json({
        error:
          error.message ||
          "SERA backend error."
      });

    } else {

      res.end();
    }
  }
});


// ------------------------------
// TRAINING REQUEST
// ------------------------------

app.post(
  "/api/training/request",
  async (req, res) => {

    try {

      const {
        user_id,
        question,
        ideal_answer,
        feedback
      } = req.body;

      if (!user_id) {
        return res.status(401).json({
          error: "User not registered."
        });
      }

      if (!question?.trim()) {
        return res.status(400).json({
          error: "Question required."
        });
      }

      const
