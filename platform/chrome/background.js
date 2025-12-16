console.log("BACKGROUND SERVICE WORKER LOADED");

// singleton launcher window
let launcherWindowId = null;

// clean up on close
chrome.windows.onRemoved.addListener((id) => {
  if (id === launcherWindowId) launcherWindowId = null;
});

// keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log("COMMAND RECEIVED:", command);

  if (command === "open-launcher") {
    await openLauncher();
  }
});

// open launcher window
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

// ===============================
// VISUAL STATE → ACTIVE TAB
// ===============================
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type !== "VISUAL_STATE_UPDATE") return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    console.debug("No content script on active tab");
  }
});
