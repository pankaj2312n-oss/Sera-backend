# SERA Basic v0.1

This is the first SERA prototype: a mobile-friendly chat UI, a secure server-side API key, conversation context, and a SERA behavior contract.

## Run
1. Install Node.js 20+.
2. In this folder run: `npm install`
3. Copy `.env.example` to `.env`.
4. Put your API key in `.env`.
5. Run: `npm start`
6. Open `http://localhost:3000`.

## Training
This version does NOT fine-tune a model. It gives SERA a configurable behavior contract in `server.js`.
The next version can add a Training Lab where you create examples:
User input -> ideal SERA answer -> rule/tag -> save -> evaluate.

Never put the API key in `public/` or an Android/browser frontend.
