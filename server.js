import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 10000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.text({ type: "application/sdp" }));

const SERA_RULES = `
You are SERA, a personal AI assistant.

Your core rule:
Never stop at "I don't know".
Think through every available path and provide the most useful answer possible.

Behavior:
- Reason carefully before answering.
- Give the strongest defensible conclusion.
- Separate facts, assumptions and recommendations when useful.
- Never invent facts.
- If information is uncertain, say so briefly.
- Do not automatically agree with the user; politely correct mistakes.
- Be practical, intelligent and helpful.
- Speak naturally in Hindi/Hinglish when appropriate.
- Use respectful "aap" and "ji".
- Use feminine Hindi grammar for yourself, such as "main karti hoon" and "main bata deti hoon".
- Voice style should be warm, natural and conversational with a Punjabi-flavored Hindi/Hinglish touch.
`;

async function initDatabase() {
  if (!pool) {
    console.log("DATABASE_URL not configured. Database features disabled.");
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

  console.log("Database initialized.");
}

async function requireConsent(userId) {
  if (!pool || !userId) return false;

  const result = await pool.query(
    "SELECT user_id FROM consents WHERE user_id = $1",
    [userId]
  );

  return result.rowCount > 0;
}

app.get("/api/health", async (req, res) => {
  try {
    if (pool) {
      await pool.query("SELECT 1");
    }

    res.json({
      ok: true,
      sera: "online",
      database: Boolean(pool)
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Database connection failed"
    });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { consent } = req.body;

    if (consent !== true) {
      return res.status(400).json({
        error: "Consent is required."
      });
    }

    if (!pool) {
      return res.status(500).json({
        error: "Database is not configured."
      });
    }

    const userId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO consents (user_id, consent_version)
      VALUES ($1, $2)
      `,
      [userId, "2026-09-06"]
    );

    res.json({
      ok: true,
      user_id: userId
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Registration failed."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { user_id, session_id, messages } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: "user_id is required."
      });
    }

    const hasConsent = await requireConsent(user_id);

    if (!hasConsent) {
      return res.status(403).json({
        error: "User consent is required."
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "messages are required."
      });
    }

    const sessionId = session_id || crypto.randomUUID();

    const latestUserMessage =
      [...messages].reverse().find((m) => m.role === "user");

    if (latestUserMessage?.content && pool) {
      await pool.query(
        `
        INSERT INTO conversations
        (session_id, user_id, role, content)
        VALUES ($1, $2, 'user', $3)
        `,
        [
          sessionId,
          user_id,
          latestUserMessage.content
        ]
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      instructions: SERA_RULES,
      input: messages,
      stream: true
    });

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    let assistantText = "";

    for await (const event of response) {
      if (event.type === "response.output_text.delta") {
        assistantText += event.delta;
        res.write(event.delta);
      }
    }

    if (pool && assistantText) {
      await pool.query(
        `
        INSERT INTO conversations
        (session_id, user_id, role, content)
        VALUES ($1, $2, 'assistant', $3)
        `,
        [
          sessionId,
          user_id,
          assistantText
        ]
      );
    }

    res.end();
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "SERA could not process the request."
      });
    } else {
      res.end();
    }
  }
});

app.post("/api/training/request", async (req, res) => {
  try {
    const {
      user_id,
      question,
      ideal_answer,
      feedback
    } = req.body;

    if (!user_id || !question) {
      return res.status(400).json({
        error: "user_id and question are required."
      });
    }

    const hasConsent = await requireConsent(user_id);

    if (!hasConsent) {
      return res.status(403).json({
        error: "User consent is required."
      });
    }

    if (!pool) {
      return res.status(500).json({
        error: "Database is not configured."
      });
    }

    const result = await pool.query(
      `
      INSERT INTO training_examples
      (user_id, question, ideal_answer, feedback)
      VALUES ($1, $2, $3, $4)
      RETURNING id, status, created_at
      `,
      [
        user_id,
        question,
        ideal_answer || null,
        feedback || null
      ]
    );

    res.json({
      ok: true,
      training_example: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Training request failed."
    });
  }
});

app.post("/api/realtime", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).send(
        "OPENAI_API_KEY is missing."
      );
    }

    const sdp = req.body;

    const form = new FormData();

    form.append("sdp", sdp);

    form.append(
      "session",
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1",
        voice: "marin",
        instructions: SERA_RULES
      })
    );

    const response = await fetch(
      "https://api.openai.com/v1/realtime/calls",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: form
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error(
        "Realtime API error:",
        response.status,
        text
      );

      return res
        .status(response.status)
        .send(text);
    }

    res
      .type("application/sdp")
      .send(text);

  } catch (error) {
    console.error(error);

    res.status(500).send(
      "Realtime connection failed."
    );
  }
});

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `SERA server running on port ${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "Startup failed:",
      error
    );

    process.exit(1);
  });
