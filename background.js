// =================================================
// Singleton launcher window
// =================================================
let launcherWindowId = null;

// 🔹 NEW: remember the tab the user was on
let targetTabId = null;

// Clear launcher ID when window is closed
chrome.windows.onRemoved.addListener((id) => {
  if (id === launcherWindowId) launcherWindowId = null;
});

// =================================================
// Keyboard commands
// =================================================
chrome.commands.onCommand.addListener(async (command) => {

  if (command === "open-launcher") {
    // 🔹 CAPTURE CURRENT TAB (e.g. Wikipedia)
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    targetTabId = tab?.id ?? null;
    console.log("TARGET TAB SET TO:", targetTabId);

    await openLauncher(); // visible launcher for now
  }

  if (command === "close-launcher") {
    await closeHiddenLauncher();
    targetTabId = null;
  }
});

// =================================================
// Launcher windows
// =================================================
async function openLauncher() {
  if (launcherWindowId) return;

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("launcher.html"),
    type: "popup",
    width: 420,
    height: 820,
    focused: true
  });

  launcherWindowId = win.id;
}

async function openHiddenLauncher() {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) return;

  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("hidden_launcher.html"),
    reasons: ["USER_MEDIA"],
    justification: "Run blink detection without a visible window."
  });
}

async function closeHiddenLauncher() {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

// =================================================
// 🔹 PROXIMITY → CONTENT SCRIPT (UX PIPE)
// =================================================
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type !== "PROXIMITY_UPDATE") return;

  console.log("BACKGROUND GOT:", msg, "targetTabId:", targetTabId);

  if (!targetTabId) return;

  try {
    await chrome.tabs.sendMessage(targetTabId, msg);
    console.log("BACKGROUND SENT TO TAB:", targetTabId);
  } catch (e) {
    console.warn(
      "Could not send message to tab. Reload the page.",
      e
    );
  }
});
