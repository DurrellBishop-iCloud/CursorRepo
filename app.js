const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const textLayer = document.getElementById("text-layer");
const startOverlay = document.getElementById("startOverlay");
const statusLabel = document.getElementById("statusLabel");
const phrasesInput = document.getElementById("phrasesInput");
const startBtn = document.getElementById("startBtn");
const authoringSection = document.getElementById("authoring");
const cameraSection = document.getElementById("cameraSection");
const statusSection = document.getElementById("statusSection");

const { Engine, World, Bodies, Body, Runner } = Matter;

const defaultPhrases = [
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
let phrases = [...defaultPhrases];
let wordIndex = 0;
let lastSentenceEnd = 0;
const FULL_STOP_COOLDOWN_MS = 300;

let lastSpawn = 0;
let lastOpen = false;
let openStart = 0;
let camera;
let hasStarted = false;
let engine;
let runner;
let walls = [];
let textBodies = [];
let animationFrameId;
let resizeObserver;

function setStatus(text) {
  statusLabel.textContent = text;
}

function parsePhrases(raw) {
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function applyPhrases(raw, shouldSave = true) {
  const parsed = parsePhrases(raw);
  const words = [];
  parsed.forEach((token) => {
    const endsSentence = /[.!?]+$/.test(token);
    const cleaned = token.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!cleaned) return;
    words.push({ text: cleaned, endsSentence });
  });
  phrases = words.length ? words : defaultPhrases.map((text) => ({
    text,
    endsSentence: /[.!?]+$/.test(text),
  }));
  wordIndex = 0;
  lastSentenceEnd = 0;
  if (shouldSave) {
    localStorage.setItem("phrases", raw);
  }
}

function showOverlay(message) {
  if (message) startOverlay.textContent = message;
  startOverlay.classList.remove("hidden");
}

function hideOverlay() {
  startOverlay.classList.add("hidden");
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

function getLayerSize() {
  const rect = textLayer.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function createWalls(width, height) {
  const thickness = 80;
  const options = { isStatic: true, restitution: 0.9, friction: 0.1 };
  const newWalls = [
    Bodies.rectangle(width / 2, -thickness / 2, width, thickness, options),
    Bodies.rectangle(
      width / 2,
      height + thickness / 2,
      width,
      thickness,
      options
    ),
    Bodies.rectangle(-thickness / 2, height / 2, thickness, height, options),
    Bodies.rectangle(
      width + thickness / 2,
      height / 2,
      thickness,
      height,
      options
    ),
  ];

  if (walls.length) {
    World.remove(engine.world, walls);
  }

  walls = newWalls;
  World.add(engine.world, walls);
}

function updateCanvasSize() {
  const { width, height } = getLayerSize();
  overlay.width = width;
  overlay.height = height;
  if (engine) {
    createWalls(width, height);
  }
}

function initPhysics() {
  if (engine) return;
  engine = Engine.create();
  engine.gravity.y = 0.7;

  runner = Runner.create();
  Runner.run(runner, engine);

  updateCanvasSize();

  resizeObserver = new ResizeObserver(updateCanvasSize);
  resizeObserver.observe(textLayer);

  const step = () => {
    textBodies.forEach(({ body, el }) => {
      el.style.transform = `translate(${body.position.x}px, ${body.position.y}px) translate(-50%, -50%) rotate(${body.angle}rad)`;
    });
    animationFrameId = requestAnimationFrame(step);
  };
  step();
}

function removeTextBody(entry) {
  if (!entry) return;
  World.remove(engine.world, entry.body);
  entry.el.remove();
  textBodies = textBodies.filter((item) => item !== entry);
}

function getNextWord() {
  if (!phrases.length) return null;
  const entry = phrases[wordIndex % phrases.length];
  wordIndex += 1;
  return entry;
}

function spawnText(xPx, yPx) {
  if (!engine) return;

  const el = document.createElement("div");
  el.className = "fly-text";
  const entry = getNextWord();
  if (!entry) return;
  el.textContent = entry.text;
  textLayer.appendChild(el);

  const rect = el.getBoundingClientRect();
  const body = Bodies.rectangle(
    xPx,
    yPx,
    rect.width + 16,
    rect.height + 12,
    {
      restitution: 0.9,
      friction: 0.05,
      frictionAir: 0.01,
      density: 0.001,
    }
  );

  const entry = { body, el };
  textBodies.push(entry);
  World.add(engine.world, body);

  Body.setVelocity(body, {
    x: (Math.random() - 0.5) * 8,
    y: -6 - Math.random() * 4,
  });
  Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);

  setTimeout(() => removeTextBody(entry), 7000);
}

async function startCamera() {
  if (hasStarted) return;
  hasStarted = true;
  setStatus("Starting camera...");

  initPhysics();

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

    if (isOpen && !lastOpen) {
      if (lastSentenceEnd && now - lastSentenceEnd < FULL_STOP_COOLDOWN_MS) {
        lastOpen = isOpen;
        return;
      }
      openStart = now;
      lastSpawn = now;
      const mouth = landmarks[13];
      const { width, height } = getLayerSize();
      spawnText(mouth.x * width, mouth.y * height);
      const previous = phrases[(wordIndex - 1 + phrases.length) % phrases.length];
      if (previous?.endsSentence) {
        lastSentenceEnd = now;
      }
    } else if (isOpen && now - openStart > 300 && now - lastSpawn > 200) {
      const mouth = landmarks[13];
      const { width, height } = getLayerSize();
      spawnText(mouth.x * width, mouth.y * height);
      lastSpawn = now;
      const previous = phrases[(wordIndex - 1 + phrases.length) % phrases.length];
      if (previous?.endsSentence) {
        lastSentenceEnd = now;
      }
    } else if (!isOpen && lastOpen) {
      openStart = 0;
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
  hideOverlay();
}

window.addEventListener("load", () => {
  const saved = localStorage.getItem("phrases");
  phrasesInput.value = saved ? saved : defaultPhrases.join("\n");
  applyPhrases(phrasesInput.value, false);
  authoringSection.classList.remove("hidden");
  cameraSection.classList.add("hidden");
  statusSection.classList.add("hidden");
  hideOverlay();
  setStatus("Ready");

  const handleStartError = (err) => {
    console.error(err);
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      setStatus("Tap to enable camera");
      showOverlay("Tap to enable camera");
      startOverlay.addEventListener(
        "click",
        () => {
          showOverlay("Starting camera...");
          startCamera().catch((startErr) => {
            console.error(startErr);
            setStatus("Camera error. Check permissions.");
          });
        },
        { once: true }
      );
      return;
    }

    setStatus("Camera error. Check permissions.");
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (runner && engine) Runner.stop(runner);
    if (resizeObserver) resizeObserver.disconnect();
  };

  startBtn.addEventListener("click", () => {
    applyPhrases(phrasesInput.value, true);
    wordIndex = 0;
    lastSentenceEnd = 0;
    authoringSection.classList.add("hidden");
    cameraSection.classList.remove("hidden");
    statusSection.classList.remove("hidden");
    startCamera().catch(handleStartError);
  });
});
