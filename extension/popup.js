const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnStartAll = document.getElementById("btn-start-all");
const btnStopAll = document.getElementById("btn-stop-all");
const serverStatus = document.getElementById("server-status");
const currentInfo = document.getElementById("current-info");
const currentTitle = document.getElementById("current-title");
const currentPlatform = document.getElementById("current-platform");
const sessionsDiv = document.getElementById("sessions");
const modeRadios = document.querySelectorAll('input[name="captureMode"]');
const whisperKeyInput = document.getElementById("whisper-key");
const whisperLangSelect = document.getElementById("whisper-lang");
const btnSaveSettings = document.getElementById("btn-save-settings");
const settingsToggle = document.getElementById("settings-toggle");
const settingsDiv = document.getElementById("settings");

let currentTabId = null;
let currentMode = "dom";

// detectPlatform is provided by platform.js (shared with content.js)

function getSelectedMode() {
  const checked = document.querySelector('input[name="captureMode"]:checked');
  return checked ? checked.value : "dom";
}

function updateButtonLabels() {
  if (currentMode === "audio") {
    btnStart.textContent = "开始音频转录";
  } else {
    btnStart.textContent = "开始捕获当前页";
  }
}

async function refreshStatus() {
  // Check server health
  try {
    const res = await chrome.runtime.sendMessage({ action: "health" });
    if (res.ok) {
      serverStatus.textContent = "已连接";
      serverStatus.className = "status connected";
    } else {
      serverStatus.textContent = "未连接";
      serverStatus.className = "status disconnected";
    }
  } catch {
    serverStatus.textContent = "未连接";
    serverStatus.className = "status disconnected";
  }

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;

    // Check audio capture status first
    let isAudioActive = false;
    try {
      const audioStatus = await chrome.runtime.sendMessage({ action: "getAudioCaptureStatus" });
      if (audioStatus && audioStatus[currentTabId]) {
        isAudioActive = true;
        currentMode = "audio";
        document.querySelector('input[value="audio"]').checked = true;
        btnStart.style.display = "none";
        btnStop.style.display = "block";
        currentInfo.style.display = "block";
        currentTitle.textContent = audioStatus[currentTabId].tabTitle || tab.title;
        currentPlatform.textContent = "audio";
        updateButtonLabels();
      }
    } catch {
      // ignore
    }

    if (!isAudioActive) {
      currentMode = getSelectedMode();
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { action: "status" });
        if (status.running) {
          btnStart.style.display = "none";
          btnStop.style.display = "block";
          currentInfo.style.display = "block";
          currentTitle.textContent = status.title || tab.title;
          currentPlatform.textContent = status.platform;
        } else {
          btnStart.style.display = "block";
          btnStop.style.display = "none";
          currentInfo.style.display = "none";
        }
      } catch {
        btnStart.style.display = "block";
        btnStop.style.display = "none";
        currentInfo.style.display = "none";
      }
    }
  }

  // Get active sessions from server
  try {
    const data = await chrome.runtime.sendMessage({ action: "getSessions" });
    if (data.sessions && data.sessions.length > 0) {
      // Use DOM API to avoid XSS from untrusted session titles
      sessionsDiv.replaceChildren();
      for (const s of data.sessions) {
        const div = document.createElement("div");
        div.className = "session";
        const titleSpan = document.createElement("span");
        titleSpan.className = "title";
        titleSpan.textContent = s.tabTitle;
        const countSpan = document.createElement("span");
        countSpan.className = "count";
        countSpan.textContent = s.lineCount + " 条";
        div.appendChild(titleSpan);
        div.appendChild(countSpan);
        sessionsDiv.appendChild(div);
      }
    } else {
      sessionsDiv.textContent = "";
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty";
      emptyDiv.textContent = "暂无活跃会话";
      sessionsDiv.appendChild(emptyDiv);
    }
  } catch {
    sessionsDiv.textContent = "";
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty";
    emptyDiv.textContent = "服务器未连接";
    sessionsDiv.appendChild(emptyDiv);
  }
}

btnStart.addEventListener("click", async () => {
  if (!currentTabId) return;
  const mode = getSelectedMode();
  if (mode === "audio") {
    await chrome.runtime.sendMessage({ action: "startAudioCapture", tabId: currentTabId });
  } else {
    await chrome.tabs.sendMessage(currentTabId, { action: "start" });
  }
  setTimeout(refreshStatus, 500);
});

btnStop.addEventListener("click", async () => {
  if (!currentTabId) return;
  const mode = getSelectedMode();
  if (mode === "audio") {
    await chrome.runtime.sendMessage({ action: "stopAudioCapture", tabId: currentTabId });
  } else {
    await chrome.tabs.sendMessage(currentTabId, { action: "stop" });
  }
  setTimeout(refreshStatus, 500);
});

btnStartAll.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "captureAll" });
  setTimeout(refreshStatus, 1000);
});

btnStopAll.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "stopAll" });
  setTimeout(refreshStatus, 500);
});

// Mode radio change handler
modeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    currentMode = radio.value;
    updateButtonLabels();
    refreshStatus();
  });
});

// Settings toggle
settingsToggle.addEventListener("click", () => {
  settingsDiv.style.display = settingsDiv.style.display === "none" ? "block" : "none";
});

// Settings save
btnSaveSettings.addEventListener("click", () => {
  chrome.storage.sync.set({
    whisperKey: whisperKeyInput.value,
    whisperLang: whisperLangSelect.value
  });
});

// Load settings on popup open
chrome.storage.sync.get(["whisperKey", "whisperLang"], (data) => {
  if (data.whisperKey) whisperKeyInput.value = data.whisperKey;
  if (data.whisperLang) whisperLangSelect.value = data.whisperLang;
});

// Initial load + auto-refresh
refreshStatus();
setInterval(refreshStatus, 3000);
