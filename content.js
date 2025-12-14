console.log("BLINK content.js LOADED");

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "PROXIMITY_UPDATE") return;

  const root = document.documentElement;

  // Init פעם אחת
  if (!root.dataset.blinkInit) {
    root.style.transition = "font-size 0.6s ease, line-height 0.6s ease";
    root.dataset.blinkInit = "true";
  }

  if (msg.proximity === "FAR") {
    root.style.fontSize = "110%";
    root.style.lineHeight = "1.7";
  } else if (msg.proximity === "MID") {
    root.style.fontSize = "105%";
    root.style.lineHeight = "1.6";
  } else {
    root.style.fontSize = "100%";
    root.style.lineHeight = "1.5";
  }
});
