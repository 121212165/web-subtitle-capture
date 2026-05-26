# Web Subtitle Capture

![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-4285F4?logo=google-chrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Obsidian](https://img.shields.io/badge/Obsidian-Writer-7C3AED?logo=obsidian&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-green)

---

从网页视频中自动捕获字幕并保存到 Obsidian 笔记。支持飞书、小鹅通、YouTube、Bilibili 等平台，通过 MutationObserver 实时监听 DOM 变化，多标签页独立会话，自动写入带时间戳的 Markdown 文件。

A Chrome extension paired with a local Node.js server that captures video subtitles from web pages in real time and saves them as timestamped Markdown files in Obsidian. Supports Feishu, Xiaoe-tech, YouTube, Bilibili, and more through DOM mutation monitoring with per-tab session isolation.

## Features

- **Real-time subtitle capture** via MutationObserver + WebVTT polling, no screen recording needed
- **Platform auto-detection** for Feishu, Xiaoe-tech, YouTube, Bilibili, Video.js, and generic subtitle overlays
- **Auto-start on page load** when subtitle elements are detected (2-second scan delay)
- **Multi-session isolation** -- each browser tab gets its own capture session and output file
- **Obsidian-ready output** with date-based filenames (`{title}-{YYYY-MM-DD}.md`) and per-line timestamps
- **Popup UI** showing server connection status, active sessions, and per-tab or bulk start/stop controls
- **Zero runtime dependencies** on the server side -- uses only Node.js built-in `http` module

## Features

- **实时字幕捕获**，基于 MutationObserver + WebVTT 轮询，无需录屏
- **平台自动识别**，覆盖飞书、小鹅通、YouTube、Bilibili、Video.js 及通用字幕覆盖层
- **页面加载自动启动**，检测到字幕元素后自动开始捕获（2 秒延迟扫描）
- **多会话隔离**，每个浏览器标签页拥有独立的捕获会话和输出文件
- **Obsidian 友好输出**，基于日期的文件名（`{title}-{YYYY-MM-DD}.md`）和逐行时间戳
- **弹出窗口 UI**，显示服务器连接状态、活跃会话列表，支持单标签页或全部启停控制
- **服务端零运行时依赖**，仅使用 Node.js 内置 `http` 模块

## Prerequisites

- **Chrome** 116 or later (Manifest V3 support)
- **Node.js** 18 or later
- **Obsidian** (optional -- the server writes plain Markdown files to any local directory)

## Prerequisites

- **Chrome** 116 或更高版本（支持 Manifest V3）
- **Node.js** 18 或更高版本
- **Obsidian**（可选 -- 服务端仅向本地目录写入纯 Markdown 文件）

## Quick Start

### 1. Start the local server

```bash
cd server
npm install
npm start
```

The server listens on `http://localhost:3210` and prints a confirmation message when ready.

### 2. Load the Chrome extension

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. The extension icon appears in the toolbar

### 3. Capture subtitles

1. Open a video page with visible subtitles (e.g., a Feishu live stream or YouTube video)
2. The extension auto-detects subtitle elements within 2 seconds and starts capturing
3. Subtitles are written to the Obsidian vault directory in real time

### 4. Multi-tab capture (optional)

Open 3+ video tabs simultaneously. Each tab creates an independent session, and each session writes to a separate Markdown file based on the page title.

---

### 1. 启动本地服务器

```bash
cd server
npm install
npm start
```

服务器监听 `http://localhost:3210`，启动成功后会在终端打印确认信息。

### 2. 加载 Chrome 扩展

1. 在 Chrome 中打开 `chrome://extensions`
2. 开启右上角的**开发者模式**
3. 点击**加载已解压的扩展程序**，选择 `extension/` 文件夹
4. 工具栏中出现扩展图标

### 3. 捕获字幕

1. 打开一个有可见字幕的视频页面（如飞书直播、YouTube 视频）
2. 扩展在 2 秒内自动检测到字幕元素并开始捕获
3. 字幕实时写入 Obsidian vault 目录下的 Markdown 文件

### 4. 多标签页同时捕获（可选）

同时打开 3 个以上视频标签页，每个标签页创建独立会话，各自写入以页面标题命名的独立 Markdown 文件。

## Usage

### Popup controls

| Button | Action |
|--------|--------|
| Start Capture | Start capturing on the current tab |
| Stop Capture | Stop capturing on the current tab |
| Start All | Start capturing on all open tabs |
| Stop All | Stop capturing on all open tabs |

The popup auto-refreshes every 3 seconds and displays:
- Server connection status (connected / disconnected)
- Current tab title and detected platform
- List of all active sessions with line counts

### Output format

Each capture session writes to a Markdown file in the Obsidian vault:

```
# Page Title — 2026年5月26日

> 14:30:05 开始捕获

14:30:06 | Welcome to today's lecture.
14:30:12 | Let's start with the first topic.
14:30:18 | This is an important concept.
```

Filename pattern: `{sanitized-title}-{YYYY-MM-DD}.md`

---

### 弹出窗口控制

| 按钮 | 操作 |
|------|------|
| 开始捕获 | 在当前标签页开始捕获 |
| 停止捕获 | 停止当前标签页的捕获 |
| 全部开始 | 在所有已打开的标签页开始捕获 |
| 全部停止 | 停止所有标签页的捕获 |

弹出窗口每 3 秒自动刷新，显示以下信息：
- 服务器连接状态（已连接 / 未连接）
- 当前标签页标题和检测到的平台
- 所有活跃会话列表及其已捕获行数

### 输出格式

每个捕获会话写入 Obsidian vault 中的一个 Markdown 文件：

```
# Page Title — 2026年5月26日

> 14:30:05 开始捕获

14:30:06 | Welcome to today's lecture.
14:30:12 | Let's start with the first topic.
14:30:18 | This is an important concept.
```

文件名模式：`{sanitized-title}-{YYYY-MM-DD}.md`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Tab 1   │  │  Tab 2   │  │  Tab 3   │  ...         │
│  │ content.js│  │ content.js│  │ content.js│             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │              │              │                    │
│       │  MutationObserver / WebVTT Polling               │
│       │              │              │                    │
│  ┌────┴──────────────┴──────────────┴────┐              │
│  │          background.js                │              │
│  │       (Service Worker / Router)        │              │
│  └──────────────────┬────────────────────┘              │
│                     │                                    │
│  ┌──────────────────┴────────────────────┐              │
│  │     popup.html / popup.js / popup.css  │              │
│  │       (Session list / Controls)        │              │
│  └───────────────────────────────────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │  HTTP POST /api/subtitle
                     │  (localhost:3210)
                     ▼
┌────────────────────────────────────────────────────────┐
│                Node.js Server                           │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  index.ts    │  │ sessions.ts  │  │  writer.ts   │ │
│  │  HTTP Router │→ │  Session     │→ │  Obsidian    │ │
│  │              │  │  Manager     │  │  Writer      │ │
│  └──────────────┘  └──────────────┘  └──────┬───────┘ │
│                                             │         │
└─────────────────────────────────────────────┼─────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │   Obsidian Vault  │
                                    │                  │
                                    │  notes/          │
                                    │   ├─ Title-A.md  │
                                    │   ├─ Title-B.md  │
                                    │   └─ Title-C.md  │
                                    └──────────────────┘
```

### Data flow

1. **Content script** (`content.js`) runs in each tab, auto-detects the platform, and monitors subtitle DOM elements via `MutationObserver` and a 500ms WebVTT poll interval.
2. **Background service worker** (`background.js`) routes messages between the popup and content scripts, and proxies session queries to the server.
3. **Local server** (`server/src/`) receives subtitle text over HTTP, manages per-tab sessions, and writes timestamped lines to individual Markdown files via the `ObsidianWriter` class.

### 数据流

1. **Content script**（`content.js`）在每个标签页中运行，自动检测平台类型，通过 `MutationObserver` 和 500ms WebVTT 轮询间隔监听字幕 DOM 元素。
2. **Background service worker**（`background.js`）在弹出窗口和 content script 之间路由消息，并将会话查询代理到服务端。
3. **本地服务器**（`server/src/`）通过 HTTP 接收字幕文本，管理按标签页隔离的会话，通过 `ObsidianWriter` 类将带时间戳的行写入独立的 Markdown 文件。

## Supported Platforms

| Platform | Domain | Detection Method |
|----------|--------|------------------|
| Feishu / Lark | `feishu.cn`, `larksuite.com` | Subtitle/caption CSS class selectors |
| Xiaoe-tech | `xiaoe-tech.com`, `xege.org` | Subtitle class + Video.js selectors |
| YouTube | `youtube.com` | `.ytp-caption-segment`, `.caption-visual-line` |
| Bilibili | `bilibili.com` | `.bpx-player-subtitle-wrap` selectors |
| Video.js | any site using Video.js | `.vjs-text-track-display` selectors |
| Generic | any other site | Broad `[class*="subtitle"]`, `[class*="caption"]`, WebVTT `<track>` elements |

If a platform is not explicitly listed, the generic adapter attempts to match common subtitle CSS class patterns and native WebVTT tracks.

---

| 平台 | 域名 | 检测方式 |
|------|------|----------|
| 飞书 / Lark | `feishu.cn`, `larksuite.com` | 字幕/字幕 CSS 类选择器 |
| 小鹅通 | `xiaoe-tech.com`, `xege.org` | 字幕类名 + Video.js 选择器 |
| YouTube | `youtube.com` | `.ytp-caption-segment`, `.caption-visual-line` |
| Bilibili | `bilibili.com` | `.bpx-player-subtitle-wrap` 选择器 |
| Video.js | 任何使用 Video.js 的站点 | `.vjs-text-track-display` 选择器 |
| 通用 | 任意其他站点 | 通用 `[class*="subtitle"]`, `[class*="caption"]` 选择器，WebVTT `<track>` 元素 |

如果平台未明确列出，通用适配器会尝试匹配常见的字幕 CSS 类模式和原生 WebVTT 轨道。

## Configuration

The server reads two environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OBSIDIAN_VAULT` | `C:\Users\lenovo\Documents\Obsidian\explorer` | Absolute path to your Obsidian vault |
| `NOTES_DIR` | `notes` | Subdirectory within the vault for captured notes |

Example with custom paths:

```bash
OBSIDIAN_VAULT="/home/user/MyVault" NOTES_DIR="subtitles" npm start
```

On Windows PowerShell:

```powershell
$env:OBSIDIAN_VAULT="D:\Obsidian\MyVault"; $env:NOTES_DIR="captured"; npm start
```

---

服务器读取两个环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OBSIDIAN_VAULT` | `C:\Users\lenovo\Documents\Obsidian\explorer` | Obsidian vault 的绝对路径 |
| `NOTES_DIR` | `notes` | vault 中存放捕获笔记的子目录 |

自定义路径示例：

```bash
OBSIDIAN_VAULT="/home/user/MyVault" NOTES_DIR="subtitles" npm start
```

Windows PowerShell 示例：

```powershell
$env:OBSIDIAN_VAULT="D:\Obsidian\MyVault"; $env:NOTES_DIR="captured"; npm start
```

## Project Structure

```
web-subtitle-capture/
├── extension/
│   ├── manifest.json          # Manifest V3 configuration
│   ├── content.js             # DOM monitoring, platform detection, subtitle extraction
│   ├── background.js          # Service worker, tab session management, message routing
│   ├── popup.html             # Popup UI markup
│   ├── popup.js               # Popup logic: session list, start/stop controls
│   ├── popup.css              # Popup styling
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── server/
│   ├── package.json           # Node.js project config (zero runtime deps)
│   ├── tsconfig.json          # TypeScript configuration
│   └── src/
│       ├── index.ts           # HTTP server (port 3210), API routes, CORS
│       ├── sessions.ts        # Multi-session manager (Map-based, per-tab isolation)
│       └── writer.ts          # Obsidian Markdown writer (timestamps, date filenames)
└── README.md
```

## Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test with a local Chrome extension load
4. Commit with a descriptive message: `git commit -m "feat: add XYZ platform adapter"`
5. Push and open a Pull Request

Please test against at least one supported platform before submitting. If adding a new platform adapter, add the relevant CSS selectors to `SELECTORS` in `content.js` and update the platform table above.

## Contributing

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 修改代码并在本地加载 Chrome 扩展进行测试
4. 使用描述性提交信息：`git commit -m "feat: add XYZ platform adapter"`
5. 推送并创建 Pull Request

提交前请至少在一个支持的平台上测试。如果添加新的平台适配器，请在 `content.js` 的 `SELECTORS` 中添加相应的 CSS 选择器，并更新上方的平台表格。

## License

[MIT](LICENSE) -- use freely for personal and commercial projects.

## License

[MIT](LICENSE) -- 自由用于个人和商业项目。
