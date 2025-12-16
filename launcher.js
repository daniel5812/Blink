// MediaPipe (for extensions it has to be local)
import { FaceLandmarker, FilesetResolver } from "./vendor/tasks-vision@0.10.14.js";

/* =========================================================
   ELEMENTS
   ========================================================= */

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const openBtn = document.getElementById("open");
const ctx = overlay.getContext("2d");

const $ = (id) => document.getElementById(id);

const labels = {
  yaw: $("yaw"),
  pitch: $("pitch"),
  roll: $("roll"),
  ear: $("ear"),
  mar: $("mar"),
};

/* =========================================================
   HELPERS / MATH
   ========================================================= */

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function dist(a, b) {
  const dx = a.x - b.x,
    dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// EAR (eye aspect ratio) - eye openness metric
function eyeEAR(L, idx) {
  // idx is {A,B,C,D,E,F}
  return (
    (dist(L[idx.B], L[idx.E]) + dist(L[idx.C], L[idx.F])) /
    (2 * dist(L[idx.A], L[idx.D]))
  );
}

const LE = { A: 263, B: 387, C: 373, D: 362, E: 380, F: 385 }; // left eye
const RE = { A: 33, B: 159, C: 145, D: 133, E: 153, F: 158 }; // right eye

// MAR (mouth aspect ratio) - mouth openness metric
function mouthMAR(L) {
  const M = { top: 13, bottom: 14, left: 78, right: 308 };
  return dist(L[M.top], L[M.bottom]) / dist(L[M.left], L[M.right]);
}

function calculateEyeDistance(L) {
  try {
    // Iris landmarks (works when model provides them)
    const right = L[468]; // right eye center
    const left = L[473]; // left eye center

    const rightPx = { x: right.x * video.videoWidth, y: right.y * video.videoHeight };
    const leftPx = { x: left.x * video.videoWidth, y: left.y * video.videoHeight };

    const d = dist(leftPx, rightPx);
    return Math.round(d);
  } catch (error) {
    console.error("Eye distance calculation error:", error);
    return 0;
  }
}

// Euler angles (rad) from 4x4 Matrix — column-major
function eulerFromMatrix(m) {
  const r00 = m[0],
    r01 = m[4],
    r02 = m[8];
  const r10 = m[1],
    r11 = m[5],
    r12 = m[9];
  const r20 = m[2],
    r21 = m[6],
    r22 = m[10];

  const yaw = -Math.atan2(-r20, Math.hypot(r00, r10));
  const roll = Math.atan2(r10, r00);
  const pitch = -Math.atan2(r21, r22);

  return { yaw, pitch, roll };
}

function updateStats({ yaw, pitch, roll, ear, mar }) {
  const yawD = yaw == null ? null : (yaw * 180) / Math.PI;
  const pitchD = pitch == null ? null : (pitch * 180) / Math.PI;
  const rollD = roll == null ? null : (roll * 180) / Math.PI;

  if (yawD != null) labels.yaw.textContent = `${yawD.toFixed(0)}°`;
  if (pitchD != null) labels.pitch.textContent = `${pitchD.toFixed(0)}°`;
  if (rollD != null) labels.roll.textContent = `${rollD.toFixed(0)}°`;

  labels.ear.textContent = ear?.toFixed ? ear.toFixed(3) : "-";
  labels.mar.textContent = mar?.toFixed ? mar.toFixed(3) : "-";
}

/* =========================================================
   MODEL / CAMERA
   ========================================================= */

let landmarker;
let running = false;

// Blink counters (kept from your original)
let blinkCount = 0;
let doubleBlinkCount = 0;
let lastBlinkTime = 0;
let lastEAR = 0.3;
let isBlinking = false;
let floatingWindowId = null;
let doubleBlinkInProgress = false;

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });

  video.srcObject = stream;

  if (video.readyState < 2) {
    await new Promise((res) => {
      video.onloadedmetadata = res;
    });
  }

  await video.play();

  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

async function loadModel() {
  const fileset = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL("vendor/wasm")
  );

  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/face_landmarker.task"),
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    numFaces: 1,
  });
}

/* =========================================================
   DEBUG DRAW (landmarks)
   ========================================================= */

function drawDots(landmarks) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();

  for (const p of landmarks) {
    // mirror X to match your mirrored video in CSS
    const x = (1 - p.x) * overlay.width;
    const y = p.y * overlay.height;
    ctx.moveTo(x, y);
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  }

  ctx.fill();
}

/* =========================================================
   BLINK DETECTION (kept)
   ========================================================= */

function detectBlink(ear, headNodDeg) {
  const blinkThreshold = 0.4;
  const headNodThreshold = 25;

  const isHeadNoddedTooMuch = Math.abs(headNodDeg) > headNodThreshold;
  $("pitch-debug").textContent = `Head Nod: ${headNodDeg.toFixed(
    1
  )}° (Threshold: ±${headNodThreshold}°)`;

  if (
    ear < blinkThreshold &&
    lastEAR >= blinkThreshold &&
    !isBlinking &&
    !isHeadNoddedTooMuch
  ) {
    isBlinking = true;
    blinkCount++;
    $("blink-count").textContent = blinkCount;

    const currentTime = Date.now();

    // double blink within 500ms
    if (
      lastBlinkTime > 0 &&
      currentTime - lastBlinkTime < 500 &&
      !doubleBlinkInProgress
    ) {
      doubleBlinkCount++;
      $("double-blink-count").textContent = doubleBlinkCount;

      doubleBlinkInProgress = true;

      if (floatingWindowId) {
        chrome.windows.remove(floatingWindowId);
        floatingWindowId = null;
      } else {
        openFloatingWindow();
      }
    } else if (lastBlinkTime > 0 && currentTime - lastBlinkTime >= 500) {
      doubleBlinkInProgress = false;
    }

    lastBlinkTime = currentTime;
  } else if (ear >= blinkThreshold && isBlinking) {
    isBlinking = false;
  }

  lastEAR = ear;
}

/* =========================================================
   “BRAIN” (simple) → VISUAL_STATE
   =========================================================
   We combine:
   - proximity (eyeDistance px)
   - accumulated strain (smoothed over time)
   And we output a stable UX state:
   NORMAL / STRAIN / FATIGUE
   ========================================================= */

let lastInteraction = Date.now();
let lastTick = performance.now();
let accumulatedStrain = 0; // 0..1

// tuning knobs
const STRAIN_BUILD_RATE = 0.015;
const STRAIN_DECAY_IDLE = 0.002;
const STRAIN_DECAY_ACTIVE = 0.01;

// stability (avoid flicker)
let lastState = null;
let stableStateFrames = 0;
const STATE_STABLE_FRAMES = 10;

// treat user actions as “relaxing”
["scroll", "touchstart", "touchmove", "keydown", "wheel", "mousemove"].forEach((evt) => {
  window.addEventListener(
    evt,
    () => {
      lastInteraction = Date.now();
    },
    { passive: true }
  );
});

function proximityFromEyeDistancePx(eyeDistancePx) {
  // Your model: closer to camera => eyeDistance increases (px)
  if (eyeDistancePx > 75) return "CLOSE";
  if (eyeDistancePx > 55) return "MID";
  return "FAR";
}

function stateFromStrain(strain01) {
  if (strain01 < 0.33) return "NORMAL";
  if (strain01 < 0.70) return "STRAIN";
  return "FATIGUE";
}

function sendVisualState(state) {
  chrome.runtime.sendMessage({
    type: "VISUAL_STATE_UPDATE",
    state,
    strain: Number(accumulatedStrain.toFixed(3)),
  });
}

function updateStrain(dtMs, proximity) {
  const idleTime = Date.now() - lastInteraction;

  const isIdle = idleTime > 1500; // tweakable
  const dt = dtMs / 1000;

  // Build strain when close/mid, decay otherwise.
  // Decay is stronger when idle (we assume reading paused / resting).
  let build = 0;
  if (proximity === "CLOSE") build = STRAIN_BUILD_RATE * 1.2;
  else if (proximity === "MID") build = STRAIN_BUILD_RATE * 0.7;
  else build = 0;

  const decay = isIdle ? STRAIN_DECAY_ACTIVE : STRAIN_DECAY_IDLE;

  accumulatedStrain += build * dt;
  accumulatedStrain -= decay * dt;

  accumulatedStrain = clamp(accumulatedStrain, 0, 1);
}

/* =========================================================
   MAIN LOOP
   ========================================================= */

async function loop(ts) {
  if (!running) return;

  try {
    const results = await landmarker.detectForVideo(video, ts);

    if (results.faceLandmarks?.length) {
      const L = results.faceLandmarks[0];

      // draw landmarks (debug)
      drawDots(L);

      // compute metrics
      const leftEAR = eyeEAR(L, LE);
      const rightEAR = eyeEAR(L, RE);
      const avgEAR = (leftEAR + rightEAR) / 2;
      const mar = mouthMAR(L);
      const eyeDistance = calculateEyeDistance(L);

      // proximity
      const proximity = proximityFromEyeDistancePx(eyeDistance);

      // update strain over time
      const now = performance.now();
      const dtMs = now - lastTick;
      lastTick = now;

      updateStrain(dtMs, proximity);

      // map to state
      const nextState = stateFromStrain(accumulatedStrain);

      // stabilize state (avoid flicker)
      if (nextState === lastState) stableStateFrames++;
      else {
        lastState = nextState;
        stableStateFrames = 1;
      }

      if (stableStateFrames >= STATE_STABLE_FRAMES) {
        sendVisualState(nextState);
      }

      // update UI debug fields (kept)
      $("eye-distance").textContent = eyeDistance;
      $("eye-inverse").textContent =
        eyeDistance > 0 ? (1 / eyeDistance).toFixed(6) : "-";
      $("camera-distance").textContent =
        eyeDistance > 0 ? ((1 / eyeDistance) * 2430).toFixed(1) : "-";

      // head pose
      let yaw = null,
        pitch = null,
        roll = null;
      if (results.facialTransformationMatrixes?.length) {
        const m = results.facialTransformationMatrixes[0].data;
        ({ yaw, pitch, roll } = eulerFromMatrix(m));
      }

      updateStats({ yaw, pitch, roll, ear: avgEAR, mar });

      // blink detection
      const pitchDegrees = pitch != null ? (pitch * 180) / Math.PI : 0;
      detectBlink(avgEAR, pitchDegrees);
    } else {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      updateStats({ yaw: 0, pitch: 0, roll: 0, ear: 0, mar: 0 });
    }
  } catch (error) {
    console.error("Processing error:", error);
  }

  requestAnimationFrame(loop);
}

async function start() {
  if (running) return;

  try {
    if (!landmarker) await loadModel();
    await startCamera();

    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error("Init failed:", err);
    alert("Camera/model init failed: " + (err?.message ?? err));
  }
}

/* =========================================================
   FLOATING WINDOW (kept)
   ========================================================= */

function openFloatingWindow() {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL("floating.html"),
      type: "popup",
      width: 840,
      height: 480,
    },
    (window) => {
      floatingWindowId = window.id;
      console.log("Floating window opened with ID:", floatingWindowId);
    }
  );
}

/* =========================================================
   BOOT
   ========================================================= */

window.addEventListener("DOMContentLoaded", () => {
  // start automatically when the launcher page loads
  start();

  // optional button
  if (openBtn) {
    openBtn.addEventListener("click", () => openFloatingWindow());
  }
});
