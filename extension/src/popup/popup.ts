import { detectPlatform } from "../shared/platform-detector.js";
import { REFRESH_INTERVAL_MS } from "../shared/constants.js";
import type { CaptureStatus, SessionsResponse } from "../shared/types.js";

const btnStart = document.getElementById("btn-start") as HTMLButtonElement;
const btnStop = document.getElementById("btn-stop") as HTMLButtonElement;
const btnStartAll = document.getElementById("btn-start-all") as HTMLButtonElement;
const btnStopAll = document.getElementById("btn-stop-all") as HTMLButtonElement;
const serverStatus = document.getElementById("server-status") as HTMLDivElement;
const currentInfo = document.getElementById("current-info") as HTMLDivElement;
const currentTitle = document.getElementById("current-title") as HTMLDivElement;
const currentPlatform = document.getElementById("current-platform") as HTMLDivElement;
const sessionsDiv = document.getElementById("sessions") as HTMLDivElement;

let currentTabId: number | null = null;

async function refreshStatus(): Promise<void> {
  // Check server health
  try {
    const res = (await chrome.runtime.sendMessage({ action: "health" })) as { ok: boolean };
    if (res?.ok) {
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
  if (tab?.id) {
    currentTabId = tab.id;
    try {
      const status = (await chrome.tabs.sendMessage(tab.id, { action: "status" })) as CaptureStatus;
      if (status?.running) {
        btnStart.style.display = "none";
        btnStop.style.display = "block";
        currentInfo.style.display = "block";
        currentTitle.textContent = status.title || tab.title || "";
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
    const data = (await chrome.runtime.sendMessage({ action: "getSessions" })) as SessionsResponse;
    if (data?.sessions && data.sessions.length > 0) {
      sessionsDiv.innerHTML = "";
      for (const s of data.sessions) {
        const div = document.createElement("div");
        div.className = "session";

        const titleSpan = document.createElement("span");
        titleSpan.className = "title";
        titleSpan.textContent = s.tabTitle || "untitled";

        const countSpan = document.createElement("span");
        countSpan.className = "count";
        countSpan.textContent = s.lineCount + " 条";

        div.appendChild(titleSpan);
        div.appendChild(countSpan);
        sessionsDiv.appendChild(div);
      }
    } else {
      sessionsDiv.textContent = "暂无活跃会话";
    }
  } catch {
    sessionsDiv.textContent = "服务器未连接";
  }
}

btnStart.addEventListener("click", async () => {
  if (currentTabId) {
    btnStart.disabled = true;
    btnStart.textContent = "启动中...";
    try {
      await chrome.tabs.sendMessage(currentTabId, { action: "start" });
    } catch {
      // content script not loaded
    }
    btnStart.disabled = false;
    btnStart.textContent = "开始捕获当前页";
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
  btnStartAll.disabled = true;
  await chrome.runtime.sendMessage({ action: "captureAll" });
  btnStartAll.disabled = false;
  setTimeout(refreshStatus, 1000);
});

btnStopAll.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ action: "stopAll" });
  setTimeout(refreshStatus, 500);
});

// Initial load + auto-refresh
refreshStatus();
setInterval(refreshStatus, REFRESH_INTERVAL_MS);
