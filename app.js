const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const textLayer = document.getElementById("text-layer");
const startBtn = document.getElementById("startBtn");
const statusLabel = document.getElementById("statusLabel");

const phrases = [
  "WOW!",
  "HELLO",
  "ZAP",
  "YEAH",
  "OMG",
  "POP",
  "BOOM",
  "COOL",
  "HI",
  "BRB",
];

let lastSpawn = 0;
let lastOpen = false;
let camera;

function setStatus(text) {
  statusLabel.textContent = text;
}

function spawnText(xPct, yPct) {
  const el = document.createElement("div");
  el.className = "fly-text";
  el.textContent = phrases[Math.floor(Math.random() * phrases.length)];
  el.style.left = `${xPct}%`;
  el.style.top = `${yPct}%`;
  textLayer.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function mouthOpenRatio(landmarks) {
  const upper = landmarks[13];
  const lower = landmarks[14];
  const left = landmarks[61];
  const right = landmarks[291];
  const vertical = distance(upper, lower);
  const horizontal = distance(left, right);
  return vertical / horizontal;
}

async function startCamera() {
  startBtn.disabled = true;
  setStatus("Starting camera...");

  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;

  const faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  faceMesh.onResults((results) => {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!results.multiFaceLandmarks?.length) {
      setStatus("No face detected");
      lastOpen = false;
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const ratio = mouthOpenRatio(landmarks);
    const isOpen = ratio > 0.06;
    const now = Date.now();

    if (isOpen && !lastOpen && now - lastSpawn > 650) {
      const mouth = landmarks[13];
      spawnText(mouth.x * 100, mouth.y * 100);
      lastSpawn = now;
    }

    lastOpen = isOpen;
    setStatus(isOpen ? "Mouth open" : "Mouth closed");
  });

  camera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
    },
    width: 720,
    height: 960,
    facingMode: "user",
  });

  camera.start();
  setStatus("Running");
}

startBtn.addEventListener("click", () => {
  startCamera().catch((err) => {
    console.error(err);
    setStatus("Camera error. Check permissions.");
    startBtn.disabled = false;
  });
});
