This project is a Chrome extension that uses the webcam to detect facial landmarks and trigger actions based on eye blinks.

✅ Current features

Integrated the MediaPipe Face Landmarker model locally (bundled .task model + WASM files)

Detects facial landmarks in real time from the webcam

Calculates:

EAR (Eye Aspect Ratio) – eye openness

MAR (Mouth Aspect Ratio) – mouth openness

Yaw / Pitch / Roll – head orientation

Eye distance – used as an approximate distance-from-camera indicator

Detects blinks using EAR

Detects double blinks, which opens a floating window