const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const textLayer = document.getElementById("text-layer");
const statusLabel = document.getElementById("statusLabel");

const { Engine, World, Bodies, Body, Runner } = Matter;

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
let engine;
let runner;
let walls = [];
let textBodies = [];
let animationFrameId;
let resizeObserver;

function setStatus(text) {
  statusLabel.textContent = text;
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

function spawnText(xPx, yPx) {
  if (!engine) return;

  const el = document.createElement("div");
  el.className = "fly-text";
  el.textContent = phrases[Math.floor(Math.random() * phrases.length)];
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

    if (isOpen && now - lastSpawn > 60) {
      const mouth = landmarks[13];
      const { width, height } = getLayerSize();
      spawnText(mouth.x * width, mouth.y * height);
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

window.addEventListener("load", () => {
  startCamera().catch((err) => {
    console.error(err);
    setStatus("Camera error. Check permissions.");
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (runner && engine) Runner.stop(runner);
    if (resizeObserver) resizeObserver.disconnect();
  });
});
