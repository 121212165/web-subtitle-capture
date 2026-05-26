const btnStart = document.getElementById("btn-start");
const btnStop = document.getElementById("btn-stop");
const btnStartAll = document.getElementById("btn-start-all");
const btnStopAll = document.getElementById("btn-stop-all");
const serverStatus = document.getElementById("server-status");
const currentInfo = document.getElementById("current-info");
const currentTitle = document.getElementById("current-title");
const currentPlatform = document.getElementById("current-platform");
const sessionsDiv = document.getElementById("sessions");

let currentTabId = null;

// detectPlatform is provided by platform.js (shared with content.js)

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
  if (currentTabId) {
    await chrome.tabs.sendMessage(currentTabId, { action: "start" });
    setTimeout(refreshStatus, 500);
  }
});

btnStop.addEventListener("click", async () => {
  if (currentTabId) {
    await chrome.tabs.sendMessage(currentTabId, { action: "stop" });
    setTimeout(refreshStatus, 500);
  }
});

btnStartAll.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "captureAll" });
  setTimeout(refreshStatus, 1000);
});

btnStopAll.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "stopAll" });
  setTimeout(refreshStatus, 500);
});

// Initial load + auto-refresh
refreshStatus();
setInterval(refreshStatus, 3000);
