const form = document.querySelector("#form");
const input = document.querySelector("#input");
const chat = document.querySelector("#chat");

const history = [];

function addMessage(role, text = "") {
  const el = document.createElement("div");
  el.className = `msg ${role}`;

  const name = role === "user" ? "YOU" : "SERA";

  el.innerHTML = `
    <b>${name}</b>
    <p></p>
  `;

  el.querySelector("p").textContent = text;

  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;

  return el;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = input.value.trim();

  if (!message) return;

  addMessage("user", message);

  input.value = "";
  input.disabled = true;

  const button = form.querySelector("button");
  button.disabled = true;

  const seraMessage = addMessage("sera", "");
  const seraText = seraMessage.querySelector("p");

  let answer = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        history: history
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Server error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Streaming supported nahi hai.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, {
        stream: true
      });

      if (chunk) {
        answer += chunk;

        // Live text update
        seraText.textContent = answer;

        chat.scrollTop = chat.scrollHeight;
      }
    }

    // Remaining decoder data
    const finalChunk = decoder.decode();

    if (finalChunk) {
      answer += finalChunk;
      seraText.textContent = answer;
    }

    history.push({
      role: "user",
      content: message
    });

    history.push({
      role: "assistant",
      content: answer
    });

  } catch (error) {
    console.error("SERA ERROR:", error);

    seraText.textContent =
      "Sorry ji, error aa gaya: " + error.message;

  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});
