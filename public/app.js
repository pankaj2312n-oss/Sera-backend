const form = document.querySelector("#form");
const input = document.querySelector("#input");
const chat = document.querySelector("#chat");

const voiceButton = document.querySelector("#voiceButton");
const voiceStatus = document.querySelector("#voiceStatus");
const remoteAudio = document.querySelector("#remoteAudio");

const history = [];

let peerConnection = null;
let voiceDataChannel = null;
let localStream = null;


// --------------------------------
// CHAT UI
// --------------------------------

function addMessage(role, text = "") {

  const el = document.createElement("div");

  el.className = `msg ${role}`;

  const name = role === "user"
    ? "YOU"
    : "SERA";

  el.innerHTML = `
    <b>${name}</b>
    <p></p>
  `;

  el.querySelector("p").textContent = text;

  chat.appendChild(el);

  chat.scrollTop = chat.scrollHeight;

  return el;
}


// --------------------------------
// TEXT CHAT
// --------------------------------

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  const message = input.value.trim();

  if (!message) return;

  addMessage("user", message);

  input.value = "";
  input.disabled = true;

  const button = form.querySelector(
    'button[type="submit"]'
  );

  button.disabled = true;

  const seraMessage = addMessage(
    "sera",
    ""
  );

  const seraText =
    seraMessage.querySelector("p");

  let answer = "";

  try {

    const response = await fetch(
      "/api/chat",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          message,
          history
        })
      }
    );

    if (!response.ok) {

      const errorText =
        await response.text();

      throw new Error(
        errorText ||
        `Server error: ${response.status}`
      );
    }

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder("utf-8");

    while (true) {

      const {
        value,
        done
      } = await reader.read();

      if (done) break;

      const chunk =
        decoder.decode(value, {
          stream: true
        });

      answer += chunk;

      seraText.textContent =
        answer;

      chat.scrollTop =
        chat.scrollHeight;
    }

    answer += decoder.decode();

    seraText.textContent =
      answer;

    history.push({
      role: "user",
      content: message
    });

    history.push({
      role: "assistant",
      content: answer
    });

  } catch (error) {

    console.error(error);

    seraText.textContent =
      "Sorry ji, error aa gaya: " +
      error.message;

  } finally {

    input.disabled = false;
    button.disabled = false;

    input.focus();
  }

});


// --------------------------------
// START VOICE
// --------------------------------

async function startVoice() {

  try {

    voiceStatus.textContent =
      "🎙️ Mic permission maang rahi hoon…";

    voiceButton.disabled = true;

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });


    peerConnection =
      new RTCPeerConnection();


    // Microphone audio
    localStream
      .getTracks()
      .forEach(track => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    // SERA audio output
    peerConnection.ontrack =
      (event) => {

        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio.play().catch(
          () => {}
        );

      };


    // Data channel
    voiceDataChannel =
      peerConnection.createDataChannel(
        "oai-events"
      );


    voiceDataChannel.onopen =
      () => {

        voiceStatus.textContent =
          "🟢 SERA listening…";

        sendVoiceSessionUpdate();

      };


    voiceDataChannel.onmessage =
      (event) => {

        try {

          const data =
            JSON.parse(event.data);

          handleVoiceEvent(data);

        } catch (error) {

          console.log(
            "Voice event:",
            event.data
          );

        }

      };


    const offer =
      await peerConnection
        .createOffer();

    await peerConnection
      .setLocalDescription(offer);


    // Wait for ICE gathering
    await waitForIceGathering();


    const response =
      await fetch(
        "/api/realtime",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/sdp"
          },

          body:
            peerConnection
              .localDescription
              .sdp
        }
      );


    if (!response.ok) {

      const error =
        await response.text();

      throw new Error(error);
    }


    const answer =
      await response.text();


    await peerConnection
      .setRemoteDescription({
        type: "answer",
        sdp: answer
      });


    voiceStatus.textContent =
      "🟢 SERA voice assistant active";

    voiceButton.textContent =
      "🔴";

  } catch (error) {

    console.error(
      "Voice error:",
      error
    );

    voiceStatus.textContent =
      "❌ Voice start nahi hua: " +
      error.message;

    stopVoice();

  } finally {

    voiceButton.disabled = false;

  }
}


// --------------------------------
// SESSION CONFIG
// --------------------------------

function sendVoiceSessionUpdate() {

  if (
    !voiceDataChannel ||
    voiceDataChannel.readyState !== "open"
  ) {
    return;
  }


  voiceDataChannel.send(
    JSON.stringify({
      type: "session.update",

      session: {

        instructions: `
You are SERA.

Speak naturally in Hindi/Hinglish
with a natural Punjabi touch.

Use feminine conversational grammar.

Address the user as "aap" and "ji".

Be warm, intelligent and practical.

Do not sound robotic.
        `,

        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true
        }

      }
    })
  );

}


// --------------------------------
// VOICE EVENTS
// --------------------------------

function handleVoiceEvent(data) {

  if (
    data.type ===
    "input_audio_buffer.speech_started"
  ) {

    voiceStatus.textContent =
      "🎙️ SERA sun rahi hai…";

  }


  if (
    data.type ===
    "response.created"
  ) {

    voiceStatus.textContent =
      "🔊 SERA bol rahi hai…";

  }


  if (
    data.type ===
    "response.done"
  ) {

    voiceStatus.textContent =
      "🟢 SERA listening…";

  }


  if (
    data.type ===
    "error"
  ) {

    console.error(
      "Realtime error:",
      data
    );

    voiceStatus.textContent =
      "❌ Voice error";

  }

}


// --------------------------------
// ICE GATHERING
// --------------------------------

function waitForIceGathering() {

  return new Promise(resolve => {

    if (
      peerConnection.iceGatheringState ===
      "complete"
    ) {

      resolve();

      return;
    }


    const checkState = () => {

      if (
        peerConnection
          .iceGatheringState ===
        "complete"
      ) {

        peerConnection
          .removeEventListener(
            "icegatheringstatechange",
            checkState
          );

        resolve();

      }

    };


    peerConnection
      .addEventListener(
        "icegatheringstatechange",
        checkState
      );

  });

}


// --------------------------------
// STOP VOICE
// --------------------------------

function stopVoice() {

  if (voiceDataChannel) {

    voiceDataChannel.close();

    voiceDataChannel = null;

  }


  if (peerConnection) {

    peerConnection.close();

    peerConnection = null;

  }


  if (localStream) {

    localStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    localStream = null;

  }


  voiceButton.textContent =
    "🎙️";

  voiceStatus.textContent =
    "Voice assistant ready";

}


// --------------------------------
// VOICE BUTTON
// --------------------------------

voiceButton.addEventListener(
  "click",
  () => {

    if (peerConnection) {

      stopVoice();

    } else {

      startVoice();

    }

  }
);
