const form = document.querySelector("#form");
const input = document.querySelector("#input");
const chat = document.querySelector("#chat");
const history = [];

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `<b>${role === "user" ? "YOU" : "SERA"}</b><p></p>`;
  el.querySelector("p").textContent = text;
  chat.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  input.disabled = true;
  form.querySelector("button").disabled = true;

  const placeholder = document.createElement("div");
  placeholder.className = "msg sera";
  placeholder.innerHTML = "<b>SERA</b><p>Thinking…</p>";
  chat.appendChild(placeholder);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ message, history })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");

    placeholder.querySelector("p").textContent = data.answer;

    history.push({role:"user", content:message});
    history.push({role:"assistant", content:data.answer});
  } catch (err) {
    placeholder.querySelector("p").textContent = "Error: " + err.message;
  } finally {
    input.disabled = false;
    form.querySelector("button").disabled = false;
    input.focus();
  }
});
