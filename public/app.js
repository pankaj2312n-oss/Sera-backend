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

  const seraMessage = addMessage("sera", "Connecting to SERA…");
  const seraText = seraMessage.querySelector("p");

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

    const raw = await res.text();

    console.log("SERA STATUS:", res.status);
    console.log("SERA RESPONSE:", raw);

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Server returned invalid response: ${raw.slice(0, 300)}`
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    const answer = data.answer;

    if (!answer) {
      throw new Error("Server returned no answer.");
    }

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
      "ERROR: " + error.message;

  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
});
