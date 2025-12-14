This project is a Chrome extension that uses the webcam to detect facial landmarks and trigger actions based on eye blinks.

✅ Current features

Integrated the MediaPipe Face Landmarker model locally (bundled .task model + WASM files)

Detects facial landmarks in real time from the webcam

The Chrome extension connects to your webcam and looks for **double blinks**.  
When you double blink, it opens a floating window.

## How it works

- Right now you trigger the extension manually with **Ctrl + B**.  
- After that, it waits for a **double blink**.  
- When a double blink is detected, it opens a new page in a floating window.  
- The goal for that page is to be an **Interactive and more readable version of whatever page you’re currently on that fits to the user**.
- The idea is to make use of a not utilized asset — the webcam — and to integrated it into the user experience. 

## Status

This is an early version — the basics are in place, but the experience will become smoother and more automatic over time.
