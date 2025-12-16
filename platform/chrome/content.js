console.log("BLINK content.js LOADED");

const root = document.documentElement;

// הגדרה חד־פעמית של אנימציה
if (!root.dataset.blinkInit) {
  root.style.transition = "font-size 0.6s ease, line-height 0.6s ease";
  root.dataset.blinkInit = "true";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "VISUAL_STATE_UPDATE") return;

  console.log("CONTENT GOT STATE:", msg.state);

  switch (msg.state) {
    case "NORMAL":
      root.style.fontSize = "";
      root.style.lineHeight = "";
      break;

    case "STRAIN":
      root.style.fontSize = "104%";
      root.style.lineHeight = "1.6";
      break;

    case "FATIGUE":
      root.style.fontSize = "110%";
      root.style.lineHeight = "1.75";
      break;
  }
});
