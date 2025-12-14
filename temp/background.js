// for making the launcher a singleton
let launcherWindowId = null; // FOR DEBBUGING - Non-hidden version
let floatingWindowId = null; // Track floating window


// makes sure launcherWindowId is cleared when the window is closed for next open
chrome.windows.onRemoved.addListener((id) => {
  if (id === launcherWindowId) launcherWindowId = null;
  if (id === floatingWindowId) floatingWindowId = null;
}); // FOR DEBBUGING - Non-hidden version


// // open with toolbar button
// chrome.action.onClicked.addListener(async () => {
//   await openLauncher();
// });






/////////////////////////////////////////////////////
// transitioning from launcher to hidden_launcher////
// open with keyboard shortcut (Ctrl+B)//////////////
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-launcher") { // ctrl + B in manifest.json
    await toggleLauncher(); // Toggle launcher window
  }
  if (command === "close-launcher") { // ctrl + Q in manifest.json
    await closeHiddenLauncher();
  }
});

// Function to toggle the launcher window
async function toggleLauncher() {
  console.log('Toggle launcher called, current launcherWindowId:', launcherWindowId);
  if (launcherWindowId) {
    // Launcher is open, close it and also close floating window if open
    console.log('Closing launcher...');
    await closeLauncher();
  } else {
    // Launcher is closed, open it
    console.log('Opening launcher...');
    await openLauncher();
  }
}

// Function to close the launcher window
async function closeLauncher() {
  if (launcherWindowId) {
    // Close floating window if it's open
    if (floatingWindowId) {
      try {
        await chrome.windows.remove(floatingWindowId);
        floatingWindowId = null;
        console.log('Floating window closed');
      } catch (error) {
        console.log('Floating window already closed or error:', error);
        floatingWindowId = null;
      }
    }
    
    // Close launcher window
    try {
      await chrome.windows.remove(launcherWindowId);
      launcherWindowId = null;
      console.log('Launcher window closed');
    } catch (error) {
      console.log('Launcher window already closed or error:', error);
      launcherWindowId = null;
    }
  }
}

// Function to open the launcher window
async function openLauncher() { // FOR DEBBUGING - Non-hidden version
  if (launcherWindowId) return; // already open → do nothing
  
  try {
    // Get screen dimensions
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    const screenWidth = primaryDisplay.workArea.width;
    const screenHeight = primaryDisplay.workArea.height;
    
    console.log('Screen dimensions:', { screenWidth, screenHeight });
    
    const win = await chrome.windows.create({
      url: chrome.runtime.getURL("launcher.html"),
      type: "popup",
      width: 50,
      height: 30,
      focused: true,
      left: screenWidth - 50,
      top: 0
    });
    launcherWindowId = win.id;
    console.log('Launcher window opened with ID:', launcherWindowId);
  } catch (error) {
    console.error('Error opening launcher window:', error);
    
    // Fallback: try without positioning
    try {
      const win = await chrome.windows.create({
        url: chrome.runtime.getURL("launcher.html"),
        type: "popup",
        width: 50,
        height: 30,
        focused: false
      });
      launcherWindowId = win.id;
      console.log('Launcher window opened (fallback) with ID:', launcherWindowId);
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
    }
  }
}

// Listen for messages from launcher about floating window
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "floatingWindowOpened") {
    floatingWindowId = message.windowId;
    console.log('Floating window opened, ID:', floatingWindowId);
  } else if (message.type === "floatingWindowClosed") {
    floatingWindowId = null;
    console.log('Floating window closed');
  }
});

async function openHiddenLauncher() {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) return; // already running
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
