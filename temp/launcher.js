// MediaPipe (appearently for extensions it has to be local)
import { FaceLandmarker, FilesetResolver } from "./vendor/tasks-vision@0.10.14.js";

// elements
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const btn = document.getElementById("toggle");
const openBtn = document.getElementById("open");
const ctx = overlay.getContext("2d");

// --- helpers for bars & stats ---
const $ = (id) => document.getElementById(id);
const bars = {
  yaw:   $("bar-yaw"),
  pitch: $("bar-pitch"),
  roll:  $("bar-roll"),
  ear:   $("bar-ear"),
  mar:   $("bar-mar"),
};
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


// Euler angles (rad) from 4x4 facial transform (row-major) - helps to see head orientation
function eulerFromMatrix(m){
  const r00=m[0], r01=m[1], r02=m[2];
  const r10=m[4], r11=m[5], r12=m[6];
  const r20=m[8], r21=m[9], r22=m[10];
  const pitch = Math.atan2(-r20, Math.sqrt(r00*r00 + r10*r10));
  const yaw   = Math.atan2(r10, r00);
  const roll  = Math.atan2(r21, r22);
  return { yaw, pitch, roll };
}

// Update UI bars (normalize to nice ranges for nice bars form)
function updateBars({yaw, pitch, roll, ear, mar}){
  // Normalize angles from [-45°, +45°] to [0..1]
  const norm = (angleDeg) => (clamp(angleDeg, -45, 45) + 45) / 90;

  const yawD   = yaw   == null ? null : yaw   * 180/Math.PI;
  const pitchD = pitch == null ? null : pitch * 180/Math.PI;
  const rollD  = roll  == null ? null : roll  * 180/Math.PI;

  if (yawD   != null){ bars.yaw.style.width   = pct(norm(yawD));   labels.yaw.textContent   = `${yawD.toFixed(0)}°`; }
  if (pitchD != null){ bars.pitch.style.width = pct(norm(pitchD)); labels.pitch.textContent = `${pitchD.toFixed(0)}°`; }
  if (rollD  != null){ bars.roll.style.width  = pct(norm(rollD));  labels.roll.textContent  = `${rollD.toFixed(0)}°`; }

  // EAR: typical blink threshold ~0.2 — map [0..0.4] to [0..1]
  bars.ear.style.width = pct(clamp(ear / 0.4, 0, 1));
  labels.ear.textContent = ear.toFixed(3);

  // MAR: neutral ~0.25–0.35; map [0..0.8] to [0..1]
  bars.mar.style.width = pct(clamp(mar / 0.8, 0, 1));
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
function detectBlink(ear) {

  const blinkThreshold = 0.4; // Lower EAR = more closed eyes - TODO - maybe add feature to calibrate this for each user
  
  if (ear < blinkThreshold && lastEAR >= blinkThreshold && !isBlinking) { //if eyes were open and now closed/less than threshold
    // Blink started
    isBlinking = true;
    blinkCount++;
    $("blink-count").textContent = blinkCount; //update displayed number of blinks
    
    // Check for double blink (within 0.5 seconds)
    const currentTime = Date.now();
    if (lastBlinkTime > 0 && (currentTime - lastBlinkTime) < 500) { // 500 ms for double blink
      // Double blink detected!
      doubleBlinkCount++;
      $("double-blink-count").textContent = doubleBlinkCount;
      console.log('Double blink detected! Count:', doubleBlinkCount, 'Time diff:', currentTime - lastBlinkTime, 'ms');
      
      // control floating window when there is a double blink
      if (floatingWindowId) {
        // Close the floating window
        chrome.windows.remove(floatingWindowId);
        floatingWindowId = null;
        console.log('Floating window closed');
        
        // Notify background script about floating window closure
        chrome.runtime.sendMessage({
          type: "floatingWindowClosed"
        });
      } else {
        // Open the floating window
        openFloatingWindow();
      }
    }
    
    lastBlinkTime = currentTime;
    console.log('Blink detected! Count:', blinkCount, 'EAR:', ear.toFixed(3));
  } else if (ear >= blinkThreshold && isBlinking) {
    // Blink ended
    isBlinking = false;
  }

  lastEAR = ear;
}

// main loop
async function loop(ts) {
  if (!running) return;
  
  try {
    const results = await landmarker.detectForVideo(video, ts);

    if (results.faceLandmarks?.length) {
      // Draw face points - ONLY FOR DEBUGGING
      drawDots(results.faceLandmarks[0]);

      // Compute stats
      const L = results.faceLandmarks[0];
      const leftEAR = eyeEAR(L, LE); // L is all points, LE is left eye indices
      const rightEAR = eyeEAR(L, RE); // RE is right eye indices
      const avgEAR = (leftEAR + rightEAR) / 2;
      const mar = mouthMAR(L);
      const eyeDistance = calculateEyeDistance(L);

      // Detect blinks
      detectBlink(avgEAR);

      // Update displayed eye distance
      $("eye-distance").textContent = eyeDistance;
      
      // eyes difference ^ -1
      const eyeInverse = eyeDistance > 0 ? (1 / eyeDistance).toFixed(6) : "-";
      $("eye-inverse").textContent = eyeInverse;
      
      // Heuristic for eyes to camera distance in cm (1/eyeDistance * 2430)
      const cameraDistance = eyeDistance > 0 ? ((1 / eyeDistance) * 2430).toFixed(1) : "-";
      $("camera-distance").textContent = cameraDistance;

      let yaw=null, pitch=null, roll=null;
      if (results.facialTransformationMatrixes?.length) {
        const m = results.facialTransformationMatrixes[0].data;
        ({ yaw, pitch, roll } = eulerFromMatrix(m));
      }

      updateBars({ yaw, pitch, roll, ear: avgEAR, mar });
    } else {
      ctx.clearRect(0,0,overlay.width,overlay.height);
      updateBars({ yaw:0, pitch:0, roll:0, ear:0, mar:0 });
    }
  } catch (error) {
    console.error('Processing error:', error);
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
    
    // Notify background script about floating window
    chrome.runtime.sendMessage({
      type: "floatingWindowOpened",
      windowId: floatingWindowId
    });
  });
}

// Position the launcher window at top-right corner
function positionLauncherWindow() {
  chrome.windows.getCurrent((window) => {
    chrome.windows.update(window.id, {
      left: screen.availWidth - 50,
      top: 0,
      width: 50,
      height: 30
    });
  });
}
window.addEventListener("DOMContentLoaded", () => {
  start(); // start automatically when the launcher page loads
  positionLauncherWindow(); // position window at top-right corner
});