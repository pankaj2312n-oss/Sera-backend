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


// ========================================
// CHAT UI
// ========================================

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


// ========================================
// TEXT CHAT
// ========================================

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
        message,
        history
      })
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        errorText ||
        `Server error: ${response.status}`
      );
    }

    if (!response.body) {
      throw new Error("Streaming supported nahi hai.");
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder("utf-8");

    while (true) {
      const {
        value,
        done
      } = await reader.read();

      if (done) break;

      const chunk = decoder.decode(value, {
        stream: true
      });

      answer += chunk;

      seraText.textContent = answer;

      chat.scrollTop = chat.scrollHeight;
    }

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
    console.error("TEXT ERROR:", error);

    seraText.textContent =
      "Sorry ji, error aa gaya: " +
      error.message;

  } finally {
    input.disabled = false;
    button.disabled = false;

    input.focus();
  }
});


// ========================================
// VOICE START
// ========================================

async function startVoice() {

  try {

    setVoiceStatus(
      "🎙️ Microphone permission maang rahi hoon..."
    );

    voiceButton.disabled = true;


    // STEP 1 — MICROPHONE

    if (!navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia) {

      throw new Error(
        "Browser microphone/WebRTC support nahi karta."
      );

    }

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });


    setVoiceStatus(
      "✅ Microphone connected..."
    );


    // STEP 2 — PEER CONNECTION

    peerConnection =
      new RTCPeerConnection();


    peerConnection.onconnectionstatechange =
      () => {

        console.log(
          "Connection state:",
          peerConnection.connectionState
        );

        setVoiceStatus(
          "🔗 Connection: " +
          peerConnection.connectionState
        );

      };


    peerConnection.oniceconnectionstatechange =
      () => {

        console.log(
          "ICE state:",
          peerConnection.iceConnectionState
        );

      };


    // STEP 3 — ADD MICROPHONE

    localStream
      .getTracks()
      .forEach((track) => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    // STEP 4 — RECEIVE SERA AUDIO

    peerConnection.ontrack =
      (event) => {

        console.log(
          "🔊 SERA audio track received"
        );

        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio.play()
          .then(() => {

            console.log(
              "🔊 Audio playback started"
            );

          })
          .catch((error) => {

            console.error(
              "Audio playback error:",
              error
            );

          });

      };


    // STEP 5 — DATA CHANNEL

    voiceDataChannel =
      peerConnection.createDataChannel(
        "oai-events"
      );


    voiceDataChannel.onopen =
      () => {

        console.log(
          "✅ Data channel OPEN"
        );

        setVoiceStatus(
          "🟢 SERA listening..."
        );

        sendVoiceSessionUpdate();

      };


    voiceDataChannel.onclose =
      () => {

        console.log(
          "Data channel closed"
        );

      };


    voiceDataChannel.onerror =
      (error) => {

        console.error(
          "Data channel error:",
          error
        );

        setVoiceStatus(
          "❌ Data channel error"
        );

      };


    voiceDataChannel.onmessage =
      (event) => {

        console.log(
          "VOICE EVENT:",
          event.data
        );

        try {

          const data =
            JSON.parse(event.data);

          handleVoiceEvent(data);

        } catch (error) {

          console.log(
            "Non JSON voice event:",
            event.data
          );

        }

      };


    // STEP 6 — CREATE OFFER

    setVoiceStatus(
      "📡 WebRTC offer create kar rahi hoon..."
    );

    const offer =
      await peerConnection.createOffer();


    await peerConnection.setLocalDescription(
      offer
    );


    // STEP 7 — WAIT ICE

    setVoiceStatus(
      "📡 Network connection prepare ho raha hai..."
    );

    await waitForIceGathering();


    console.log(
      "LOCAL SDP:",
      peerConnection.localDescription.sdp
    );


    // STEP 8 — SEND SDP TO SERVER

    setVoiceStatus(
      "☁️ SERA server se connect ho rahi hoon..."
    );

    const response =
      await fetch("/api/realtime", {

        method: "POST",

        headers: {
          "Content-Type": "application/sdp"
        },

        body:
          peerConnection
            .localDescription
            .sdp

      });


    console.log(
      "Realtime HTTP status:",
      response.status
    );


    const answer =
      await response.text();


    console.log(
      "Realtime server response:",
      answer
    );


    // IMPORTANT:
    // ERROR KO HIDE NAHI KARENGE

    if (!response.ok) {

      throw new Error(
        `Realtime server error ${response.status}: ${answer}`
      );

    }


    if (!answer) {

      throw new Error(
        "Realtime server ne empty SDP answer diya."
      );

    }


    // STEP 9 — REMOTE DESCRIPTION

    setVoiceStatus(
      "🔗 SERA voice connection establish kar rahi hai..."
    );


    await peerConnection.setRemoteDescription({

      type: "answer",

      sdp: answer

    });


    console.log(
      "✅ Remote description set"
    );


    setVoiceStatus(
      "🟢 SERA voice assistant active — boliye ji..."
    );


    voiceButton.textContent = "🔴";


  } catch (error) {

    console.error(
      "========== VOICE ERROR =========="
    );

    console.error(error);

    console.error(
      "Message:",
      error.message
    );

    console.error(
      "================================="
    );


    // ERROR AB SCREEN PAR RAHEGA

    setVoiceStatus(
      "❌ " + error.message
    );


    cleanupVoice();


  } finally {

    voiceButton.disabled = false;

  }

}


// ========================================
// VOICE SESSION
// ========================================

function sendVoiceSessionUpdate() {

  if (
    !voiceDataChannel ||
    voiceDataChannel.readyState !== "open"
  ) {

    console.log(
      "Data channel open nahi hai."
    );

    return;

  }


  const event = {

    type: "session.update",

    session: {

      instructions: `

You are SERA.

Speak naturally in Hindi/Hinglish.

Use a natural Punjabi touch when appropriate.

Use feminine conversational grammar.

Always address the user respectfully as "aap" and "ji".

Be warm, intelligent, practical and confident.

Do not sound robotic.

Think before answering.

Never invent facts.

If the user is wrong, politely correct them.

Keep your speech natural and conversational.

`,

      turn_detection: {

        type: "semantic_vad",

        eagerness: "auto",

        create_response: true,

        interrupt_response: true

      }

    }

  };


  console.log(
    "Sending session update..."
  );


  voiceDataChannel.send(
    JSON.stringify(event)
  );

}


// ========================================
// VOICE EVENTS
// ========================================

function handleVoiceEvent(data) {

  console.log(
    "SERA EVENT:",
    data.type
  );


  if (
    data.type ===
    "input_audio_buffer.speech_started"
  ) {

    setVoiceStatus(
      "🎙️ SERA sun rahi hai..."
    );

  }


  if (
    data.type ===
    "input_audio_buffer.speech_stopped"
  ) {

    setVoiceStatus(
      "🧠 SERA soch rahi hai..."
    );

  }


  if (
    data.type ===
    "response.created"
  ) {

    setVoiceStatus(
      "🔊 SERA bol rahi hai..."
    );

  }


  if (
    data.type ===
    "response.done"
  ) {

    setVoiceStatus(
      "🟢 SERA listening..."
    );

  }


  if (
    data.type ===
    "error"
  ) {

    console.error(
      "REALTIME ERROR:",
      data
    );


    setVoiceStatus(
      "❌ Realtime error: " +
      (
        data.error?.message ||
        "Unknown error"
      )
    );

  }

}


// ========================================
// ICE GATHERING
// ========================================

function waitForIceGathering() {

  return new Promise((resolve, reject) => {

    if (
      !peerConnection
    ) {

      reject(
        new Error(
          "Peer connection missing."
        )
      );

      return;

    }


    if (
      peerConnection.iceGatheringState ===
      "complete"
    ) {

      resolve();

      return;

    }


    let timeout;


    const checkState = () => {

      console.log(
        "ICE gathering:",
        peerConnection.iceGatheringState
      );


      if (
        peerConnection.iceGatheringState ===
        "complete"
      ) {

        clearTimeout(timeout);

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


    timeout = setTimeout(() => {

      peerConnection
        .removeEventListener(
          "icegatheringstatechange",
          checkState
        );

      reject(
        new Error(
          "ICE gathering timeout."
        )
      );

    }, 15000);

  });

}


// ========================================
// STATUS
// ========================================

function setVoiceStatus(text) {

  if (voiceStatus) {

    voiceStatus.textContent = text;

  }

  console.log(
    "VOICE STATUS:",
    text
  );

}


// ========================================
// CLEANUP
// ========================================

function cleanupVoice() {

  if (voiceDataChannel) {

    try {
      voiceDataChannel.close();
    } catch {}

    voiceDataChannel = null;

  }


  if (peerConnection) {

    try {
      peerConnection.close();
    } catch {}

    peerConnection = null;

  }


  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        (track) => track.stop()
      );

    localStream = null;

  }


  voiceButton.textContent = "🎙️";

}


// ========================================
// STOP VOICE
// ========================================

function stopVoice() {

  cleanupVoice();

  setVoiceStatus(
    "Voice assistant ready"
  );

}


// ========================================
// VOICE BUTTON
// ========================================

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
