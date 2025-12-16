// proximity.js

window.BlinkSensor = {
  distance: "FAR",
  idle: true
};

let lastInteraction = Date.now();

["scroll", "touchstart", "touchmove"].forEach(e =>
  window.addEventListener(e, () => lastInteraction = Date.now(), { passive: true })
);

// MediaPipe Face Detection (קל, יציב במובייל)
(async function () {
  const video = document.createElement("video");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.style.display = "none";
  document.body.appendChild(video);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" }
  });
  video.srcObject = stream;

  const detector = new FaceDetection({
    locateFile: f =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${f}`
  });

  detector.setOptions({ model: "short" });

  detector.onResults(res => {
    if (!res.detections.length) {
      BlinkSensor.distance = "FAR";
      return;
    }

    const box = res.detections[0].boundingBox;
    const area = box.width * box.height;

    if (area > 0.18) BlinkSensor.distance = "CLOSE";
    else if (area > 0.10) BlinkSensor.distance = "MID";
    else BlinkSensor.distance = "FAR";

    BlinkSensor.idle = Date.now() - lastInteraction > 2000;
  });

  const cam = new Camera(video, {
    onFrame: async () => detector.send({ image: video }),
    width: 640,
    height: 480
  });

  cam.start();
})();
