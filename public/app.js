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

  chat.scrollTo({
    top: chat.scrollHeight,
    behavior: "smooth"
  });

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

  const seraMessage = addMessage("sera", "Thinking…");
  const seraText = seraMessage.querySelector("p");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        history: history
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }

    const answer = data.answer || "Sorry ji, response nahi mila.";

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
      "Sorry ji, SERA se response nahi aa paaya.";

  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});
