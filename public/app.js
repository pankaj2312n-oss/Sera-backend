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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        history
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || `Server error: ${res.status}`);
    }

    if (!res.body) {
      throw new Error("Streaming not supported by browser.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, {
        stream: true
      });

      answer += chunk;

      // Live streaming text
      seraText.textContent = answer;

      chat.scrollTop = chat.scrollHeight;
    }

    // Flush remaining decoder data
    answer += decoder.decode();

    seraText.textContent = answer;

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
