// MediaPipe (appearently for extensions it has to be local)
import { FaceLandmarker, FilesetResolver } from "./vendor/tasks-vision@0.10.14.js";

// elements
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const btn = document.getElementById("toggle");
const openBtn = document.getElementById("open");
const ctx = overlay.getContext("2d");
const MIRRORED_PREVIEW = true;

let lastProximity = null;
let proximityStableCount = 0;
const PROXIMITY_STABLE_FRAMES = 8; // כמה פריימים נדרשים ליציבות
let lastSentProximity = null;


// --- helpers for stats ---
const $ = (id) => document.getElementById(id);
const labels = {
  yaw: $("yaw"), pitch: $("pitch"), roll: $("roll"),
  ear: $("ear"), mar: $("mar"),
};

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
function pct(x){ return clamp(x, 0, 1) * 100 + "%"; }

// euclidean distance
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }

// EAR (eye aspect ratio) - eye openess metric
function eyeEAR(L, idx){ // idx is {A,B,C,D,E,F}
  return (dist(L[idx.B],L[idx.E]) + dist(L[idx.C],L[idx.F])) / (2*dist(L[idx.A],L[idx.D]));
}
const LE = { A:263, B:387, C:373, D:362, E:380, F:385 }; //mapping for left eye
const RE = { A: 33, B:159, C:145, D:133, E:153, F:158 }; //mapping for right eye 

// MAR (mouth aspect ratio) - mouth openess metric
function mouthMAR(L){
  const M = { top:13, bottom:14, left:78, right:308 }; //mapping for mouth
  return dist(L[M.top], L[M.bottom]) / dist(L[M.left], L[M.right]);
}


function calculateEyeDistance(L) {
  try {

    const right = L[468]; // right eye center
    const left  = L[473]; // left eye center

    // Convert to pixel coordinates
    const rightPx = { x: right.x * video.videoWidth, y: right.y * video.videoHeight };
    const leftPx  = { x: left.x  * video.videoWidth, y: left.y  * video.videoHeight };

    // Calculate distance in pixels
    const eyeDistance = dist(leftPx, rightPx);

    console.log('Left eye pixels:', leftPx.x.toFixed(1), leftPx.y.toFixed(1));
    console.log('Right eye pixels:', rightPx.x.toFixed(1), rightPx.y.toFixed(1));
    console.log('Eye distance pixels:', eyeDistance.toFixed(1));

    return Math.round(eyeDistance);
    
  } catch (error) {
    console.error('Eye distance calculation error:', error);
    return 0;
  }
}


// Euler angles (rad) from 4x4 Matrix — column-major, ZYX (yaw-pitch-roll)
function eulerFromMatrix(m){
  // Column-major 3×3 rotation block:
  // [ r00 r01 r02 ]
  // [ r10 r11 r12 ]
  // [ r20 r21 r22 ]
  const r00 = m[0],  r01 = m[4],  r02 = m[8];
  const r10 = m[1],  r11 = m[5],  r12 = m[9];
  const r20 = m[2],  r21 = m[6],  r22 = m[10];

  const yaw = -Math.atan2(-r20, Math.hypot(r00, r10)); // nod up/down (Y)
  const roll   = Math.atan2(r10,  r00);                  // turn left/right (Z)
  const pitch  = -Math.atan2(r21,  r22);                  // ear tilt (X)
  return { yaw, pitch, roll };
}

// Update UI stats (numbers only)
function updateStats({yaw, pitch, roll, ear, mar}){
  const yawD   = yaw   == null ? null : yaw   * 180/Math.PI;
  const pitchD = pitch == null ? null : pitch * 180/Math.PI;
  const rollD  = roll  == null ? null : roll  * 180/Math.PI;

  if (yawD   != null){ labels.yaw.textContent   = `${yawD.toFixed(0)}°`; }
  if (pitchD != null){ labels.pitch.textContent = `${pitchD.toFixed(0)}°`; }
  if (rollD  != null){ labels.roll.textContent  = `${rollD.toFixed(0)}°`; }

  labels.ear.textContent = ear.toFixed(3);
  labels.mar.textContent = mar.toFixed(3);
}

let landmarker;   // will hold the model
let running = false;
let blinkCount = 0;
let doubleBlinkCount = 0;
let lastBlinkTime = 0;
let lastEAR = 0.3; // Initialize with typical open eye value
let isBlinking = false;
let frameCount = 0;
let lastTime = performance.now();
let floatingWindowId = null; // Track the floating window
let doubleBlinkInProgress = false; // To prevent multiple double blinks

// plug Camera into video element
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  video.srcObject = stream;

  if (video.readyState < 2) {
    await new Promise(res => { video.onloadedmetadata = res; });
  }
  await video.play();

  overlay.width  = video.videoWidth;
  overlay.height = video.videoHeight;
}

// Load the face recognition model (from local face_landmarker.task)
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

// refresh function for showing dots (mirrored to match video, because video is also mirrored)
// ONLY NEEDED FOR DEBUGGING, cause main goal is not show dots, just blink detection
function drawDots(landmarks) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  for (const p of landmarks) {
    // Mirror the x coordinate to match the mirrored video
    const x = (1 - p.x) * overlay.width; // Flip horizontally
    const y = p.y * overlay.height;
    ctx.moveTo(x, y);
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  }
  ctx.fill();
}

// Blink detection using EAR
function detectBlink(ear, headNodDeg) {

  const blinkThreshold = 0.4; // Lower EAR = more closed eyes - TODO - maybe add feature to calibrate this for each user
  const headNodThreshold = 25; // Maximum head nod in degrees
  
  // Check if head is nodded too much (up or down)
  const isHeadNoddedTooMuch = Math.abs(headNodDeg) > headNodThreshold;
  
  // Display pitch degree to user for debugging (pitch is head nod up/down) 
  $("pitch-debug").textContent = `Head Nod: ${headNodDeg.toFixed(1)}° (Threshold: ±${headNodThreshold}°)`;
  
  
  if (ear < blinkThreshold && lastEAR >= blinkThreshold && !isBlinking && !isHeadNoddedTooMuch) { //if eyes were open and now closed/less than blink threshold AND head is not nodded too much
    // Blink started
    isBlinking = true;
    blinkCount++;
    $("blink-count").textContent = blinkCount; //update displayed number of blinks
    
    // Check for double blink (within 0.5 seconds) - but only if not already in a double blink
    const currentTime = Date.now();
    if (lastBlinkTime > 0 && (currentTime - lastBlinkTime) < 500 && !doubleBlinkInProgress) { // 500 ms for double blink
      // Double blink detected!
      doubleBlinkCount++;
      $("double-blink-count").textContent = doubleBlinkCount;
      doubleBlinkInProgress = true; // Set flag to prevent more double blinks
      // console.log('Double blink detected! Count:', doubleBlinkCount, 'Time diff:', currentTime - lastBlinkTime, 'ms');
      
      // control floating window when there is a double blink
      if (floatingWindowId) {
        // Close the floating window
        chrome.windows.remove(floatingWindowId);
        floatingWindowId = null;
        console.log('Floating window closed');
      } else {
        // Open the floating window
        openFloatingWindow();
      }
    } else if (lastBlinkTime > 0 && (currentTime - lastBlinkTime) >= 500) {// if more than 500ms passed since last blink
      // Reset double blink flag bacause enough time has passed
      doubleBlinkInProgress = false;
    }
    
    lastBlinkTime = currentTime;
    // console.log('Blink detected! Count:', blinkCount, 'EAR:', ear.toFixed(3), 'Head nod:', headNodDeg.toFixed(1) + '°', 'Double blink in progress:', doubleBlinkInProgress);
  } else if (ear >= blinkThreshold && isBlinking) {
    // Blink ended
    isBlinking = false;
  } else if (ear < blinkThreshold && lastEAR >= blinkThreshold && !isBlinking && isHeadNoddedTooMuch) {
    // Blink detected but rejected due to head nod
    // console.log('Blink rejected due to head nod:', headNodDeg.toFixed(1) + '° (threshold: ±' + headNodThreshold + '°)');
  }

  lastEAR = ear;
}

// main loop
async function loop(ts) {
  if (!running) return;

  try {
    const results = await landmarker.detectForVideo(video, ts);

    if (results.faceLandmarks?.length) {
      drawDots(results.faceLandmarks[0]);

      const L = results.faceLandmarks[0];
      const leftEAR = eyeEAR(L, LE);
      const rightEAR = eyeEAR(L, RE);
      const avgEAR = (leftEAR + rightEAR) / 2;
      const mar = mouthMAR(L);
      const eyeDistance = calculateEyeDistance(L);

      /* ================================
         🔹 INTENT LAYER – PROXIMITY
         ================================ */

      let proximity;
      if (eyeDistance > 75) {
        proximity = "CLOSE";
      } else if (eyeDistance > 55) {
        proximity = "MID";
      } else {
        proximity = "FAR";
      }

      console.log("PROXIMITY RAW:", proximity);

      // smoothing
      if (proximity === lastProximity) {
        proximityStableCount++;
      } else {
        lastProximity = proximity;
        proximityStableCount = 1;
      }

      // send only when stable AND changed
      if (
        proximityStableCount >= PROXIMITY_STABLE_FRAMES &&
        proximity !== lastSentProximity
      ) {
        console.log("SENDING PROXIMITY:", proximity);

        chrome.runtime.sendMessage({
          type: "PROXIMITY_UPDATE",
          proximity
        });

        lastSentProximity = proximity;
      }

      /* ================================
         🔹 DEBUG / STATS (unchanged)
         ================================ */

      $("eye-distance").textContent = eyeDistance;

      const eyeInverse = eyeDistance > 0 ? (1 / eyeDistance).toFixed(6) : "-";
      $("eye-inverse").textContent = eyeInverse;

      const cameraDistance =
        eyeDistance > 0 ? ((1 / eyeDistance) * 2430).toFixed(1) : "-";
      $("camera-distance").textContent = cameraDistance;

      let yaw = null, pitch = null, roll = null;
      if (results.facialTransformationMatrixes?.length) {
        const m = results.facialTransformationMatrixes[0].data;
        ({ yaw, pitch, roll } = eulerFromMatrix(m));
      }

      updateStats({ yaw, pitch, roll, ear: avgEAR, mar });

      const pitchDegrees = pitch != null ? pitch * 180 / Math.PI : 0;
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


// Function to open floating window
function openFloatingWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('floating.html'),
    type: 'popup',
    width: 840,
    height: 480
  }, (window) => {
    floatingWindowId = window.id;
    console.log('Floating window opened with ID:', floatingWindowId);
  });
}
window.addEventListener("DOMContentLoaded", () => {
  start(); // start automatically when the launcher page loads
});