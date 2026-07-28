# web-subtitle-capture 可AI重构文档

> **元信息**
> - 一句话定位：Chrome MV3 扩展 + 本地 Node.js/TypeScript 服务端，实时捕获网页视频字幕（DOM 监听 / 音频转录双模式）并写入 Obsidian Markdown 笔记。
> - 生成日期：2026-07-28
> - 复现深度：精确级（S 档）——单凭本文档，AI 可完全复现本项目全部源码与行为。
> - 与姊妹项目 `web-subtitle-capture-extension` 的差异：本项目 = **扩展（extension/ 目录）+ 服务端（server/ 目录）+ CI + git 仓库**；姊妹项目仅包含扩展部分（其 9 个源文件与本项目 extension/ 目录内容逐字节文本一致，仅行尾符差异），**无服务端、无构建、无 git**。姊妹项目单独运行时因缺少 localhost:3210 服务端，DOM 捕获会在健康检查处中止（详见其文档）。
> - **密钥零收录声明**：本文档不收录任何真实密钥/令牌。`server/.subtitle-token` 为服务端启动时随机生成的鉴权令牌文件（已被 .gitignore 忽略），本文档只说明其生成与校验机制，**绝不收录其值**。所有环境变量仅给出键名与占位值。

---

## 1. 项目概述

**定位**：为在线课程/直播/视频网站（飞书会议、小鹅通、YouTube、Bilibili 等）提供"边看边记"的字幕落盘工具。浏览器扩展负责抓取，本地服务端负责会话管理与 Markdown 写入，输出直接进入 Obsidian vault。

**编号功能清单**：

| # | 功能 | 实现位置 |
|---|------|----------|
| F1 | DOM 字幕实时捕获（MutationObserver + CSS 选择器） | extension/content.js |
| F2 | WebVTT `<track>` 原生字幕轮询捕获（500ms） | extension/content.js |
| F3 | 平台自动识别（feishu / xiaoe / generic 三类） | extension/platform.js |
| F4 | 页面加载 2 秒后自动检测字幕元素并自动开始捕获 | extension/content.js |
| F5 | 标签页音频捕获 + 分段（5s）上传服务端做语音转文字（STT） | extension/offscreen.js + background.js |
| F6 | 多标签页会话隔离（sessionId = URL 哈希），每会话独立输出文件 | 全链路 |
| F7 | Popup 控制面板：单页/全部 启停、模式切换、活跃会话列表、服务器状态 | extension/popup.* |
| F8 | Whisper API Key / 语言 设置持久化（chrome.storage.sync） | extension/popup.js |
| F9 | 本地 HTTP 服务端（原生 http 模块，零运行时依赖，端口 3210） | server/src/index.ts |
| F10 | 会话管理（内存 Map，行计数，活跃列表） | server/src/sessions.ts |
| F11 | Obsidian Markdown 写入（日期文件名、逐行时间戳、续写分隔线） | server/src/writer.ts |
| F12 | 可插拔 STT 服务（mock/whisper/tencent/aliyun/volcengine/free 六种 provider） | server/src/stt/* |
| F13 | 安全：CORS 仅放行 chrome-extension:// 来源；随机令牌文件鉴权机制 | server/src/index.ts |
| F14 | CI：服务端 TS 类型检查（Node 18/20/22 矩阵）+ 扩展 manifest/JS 语法校验 | .github/workflows/ci.yml |

## 2. 技术栈与环境

| 项 | 要求 |
|----|------|
| 浏览器 | Chrome ≥ 116（Manifest V3 + Offscreen API） |
| Node.js | ≥ 18（服务端使用全局 fetch、ES2022） |
| 服务端语言 | TypeScript 5.x，ESM（`"type": "module"`），经 tsx 直接运行，无编译产物 |
| 服务端运行时依赖 | **零**（仅 Node 内置 http/fs/path/crypto/url 模块） |
| 服务端 devDependencies | `@types/node ^25.9.1`、`tsx ^4.0.0`、`typescript ^5.0.0` |
| 扩展 | 原生 JS，无构建步骤，目录即产物 |

**加载/运行命令**：

```bash
# 1. 启动服务端（监听 http://localhost:3210）
cd server
npm install
npm start          # 即 tsx src/index.ts

# 2. 加载扩展
# Chrome 打开 chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择 extension/ 目录
```

**环境变量表**（仅键名+占位值；由 `server/src/*` 通过 `process.env` 读取，无 dotenv 加载器——需在 shell 中导出或借助外部工具注入）：

| 键名 | 占位值示例 | 读取位置 | 说明 |
|------|-----------|----------|------|
| STT_PROVIDER | `mock` | stt/index.ts | STT 后端选择：mock/whisper/tencent/aliyun/volcengine/free，默认 mock |
| FREE_STT_URL | `http://localhost:9000/v1/audio/transcriptions` | stt/free.ts | free 模式后端地址 |
| DASHSCOPE_API_KEY | `sk-xxx` | stt/free.ts | 可选，free 模式走 DashScope 时的 Bearer key |
| WHISPER_API_KEY | `sk-xxx` | stt/whisper.ts | whisper 模式必填，缺失则构造时抛错 |
| TENCENT_SECRET_ID / TENCENT_SECRET_KEY | `xxx` | stt/tencent.ts | tencent 模式必填（transcribe 未实现） |
| ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET | `xxx` | stt/aliyun.ts | aliyun 模式必填（transcribe 未实现） |
| VOLCENGINE_ACCESS_KEY / VOLCENGINE_SECRET_KEY | `xxx` | stt/volcengine.ts | volcengine 模式必填（transcribe 未实现） |
| OBSIDIAN_VAULT | `C:\path\to\vault` | writer.ts | vault 绝对路径，缺省 `$HOME(或 %USERPROFILE%)/obsidian-vault` |
| NOTES_DIR | `notes` | writer.ts | vault 内子目录，默认 `notes` |

**`server/.env.example` 全文逐字收录**（10 行，无任何真实密钥）：

```bash
# STT Provider: mock | free | whisper | tencent | aliyun | volcengine
STT_PROVIDER=free

# Free STT backend URL (Whisper-compatible endpoint)
FREE_STT_URL=http://localhost:9000/v1/audio/transcriptions

# Obsidian vault path
OBSIDIAN_VAULT=C:\Users\lenovo\Documents\Obsidian\explorer
NOTES_DIR=notes
```

## 3. 目录结构

```
web-subtitle-capture/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI：服务端 tsc 检查（Node 18/20/22）+ 扩展 manifest/JS 语法校验
├── .gitignore                  # 忽略 node_modules/ dist/ *.crx *.pem .DS_Store server/.subtitle-token
├── README.md                   # 中英双语说明（约 349 行，含架构图/平台表/使用说明）
├── extension/                  # Chrome MV3 扩展（加载已解压目录即可，无构建）
│   ├── manifest.json           # MV3 清单（权限、15 个 content_scripts 匹配域、popup、icons）
│   ├── platform.js             # 共享平台识别函数 detectPlatform（content 与 popup 共用）
│   ├── content.js              # 内容脚本：选择器扫描 + MutationObserver + WebVTT 轮询 + 上报
│   ├── background.js           # Service Worker：消息路由、音频会话簿记、offscreen 管理
│   ├── offscreen.html          # 离屏文档壳（仅引 offscreen.js）
│   ├── offscreen.js            # 标签页音频捕获：MediaRecorder 5s 分段 POST /api/transcribe
│   ├── popup.html              # 弹窗 UI 骨架（模式切换/按钮/会话列表/设置面板）
│   ├── popup.js                # 弹窗逻辑：状态刷新(3s)、启停、设置存取
│   ├── popup.css               # 弹窗样式（320px 宽，卡片风）
│   └── icons/
│       ├── icon16.png          # 16×16 占位图标
│       ├── icon48.png          # 48×48 占位图标
│       └── icon128.png         # 128×128 占位图标
└── server/                     # 本地 Node.js 服务端（TS + tsx，零运行时依赖）
    ├── package.json            # name: web-subtitle-capture-server，scripts.start = tsx src/index.ts
    ├── package-lock.json       # npm 生成的锁文件（devDeps 解析树）
    ├── tsconfig.json           # ES2022 / ESNext / bundler / strict
    ├── .env.example            # 环境变量示例（见第 2 章逐字收录）
    ├── .subtitle-token         # 运行时生成的鉴权令牌（gitignored，值不收录）
    └── src/
        ├── index.ts            # HTTP 服务器：端口 3210、CORS、鉴权、6 个 API 路由
        ├── sessions.ts         # SessionManager：内存会话 Map + 行计数
        ├── writer.ts           # ObsidianWriter：Markdown 落盘（时间戳行格式）
        └── stt/
            ├── types.ts        # STTService 接口
            ├── index.ts        # createSTTService 工厂（按 STT_PROVIDER 分发）
            ├── mock.ts         # 模拟 STT（返回固定中文占位文本）
            ├── whisper.ts      # OpenAI Whisper API（手工构造 multipart）
            ├── free.ts         # 免费后端（Whisper 兼容端点 / FunASR，按 URL 特征路由）
            ├── tencent.ts      # 腾讯云 STT 骨架（transcribe 抛"未实现"）
            ├── aliyun.ts       # 阿里云 NLS 骨架（transcribe 抛"未实现"）
            └── volcengine.ts   # 火山引擎 STT 骨架（transcribe 抛"未实现"）
```

## 4. 数据模型

### 4.1 chrome.runtime / chrome.tabs 消息协议（逐字收录，字段名与值均为源码原文）

所有消息为 `{ action: string, ...payload }` 形状。**消息类型全集：11 个不重复 action，跨 4 条通道共 13 条条目（startAudioCapture/stopAudioCapture 两个 action 在 A、C 两通道复用同名）**：

**A. popup → background（chrome.runtime.sendMessage）**

| action | 请求 payload | 响应 shape |
|--------|-------------|-----------|
| `"getSessions"` | 无 | 服务端 `/api/sessions` 原样透传：`{ sessions: [...] }`；失败时 `{ sessions: [] }` |
| `"health"` | 无 | 成功 `{ ok: true, status: "ok", uptime }`；失败 `{ ok: false }` |
| `"captureAll"` | 无 | `{ ok: true }`（同步返回，向所有非 chrome:// 标签广播 start） |
| `"stopAll"` | 无 | `{ ok: true }`（广播 stop） |
| `"startAudioCapture"` | `{ tabId }` | `{ ok: true, sessionId }` 或 `{ ok: false, error }` |
| `"stopAudioCapture"` | `{ tabId }` | `{ ok: true }` |
| `"getAudioCaptureStatus"` | 无 | `{ [tabId]: { sessionId, tabTitle } }` 字典 |

**B. popup/background → content（chrome.tabs.sendMessage）**

| action | 请求 payload | 响应 shape |
|--------|-------------|-----------|
| `"start"` | 无 | `{ ok: true }`（异步，startCapture 完成后） |
| `"stop"` | 无 | `{ ok: true }` |
| `"status"` | 无 | `{ running: boolean, sessionId, platform, url, title, mode: "dom" }` |

**C. background → offscreen（chrome.runtime.sendMessage，offscreen.js 监听）**

| action | payload |
|--------|---------|
| `"startAudioCapture"` | `{ tabId, sessionId, serverUrl, tabTitle }`（serverUrl 恒为 `"http://localhost:3210"`） |
| `"stopAudioCapture"` | `{ tabId }`（同一 action 也在 tab 关闭时由 background 广播） |

**D. offscreen → 广播（chrome.runtime.sendMessage）**

| action | payload | 备注 |
|--------|---------|------|
| `"audioCaptureError"` | `{ tabId, error }` | tabCapture 返回 null 时发出；**当前无任何监听方处理（已知问题）** |

### 4.2 chrome.storage 键表

| 存储区 | 键 | 值 | 写入方 | 读取方 |
|--------|----|----|--------|--------|
| `chrome.storage.sync` | `whisperKey` | 字符串（用户输入的 API Key） | popup.js 保存设置 | popup.js 回填输入框（**服务端并不读取此值，见第 10 章坑#4**） |
| `chrome.storage.sync` | `whisperLang` | `"zh"` / `"en"` / `""` | popup.js | popup.js |

### 4.3 字幕数据格式

- **sessionId**：`"tab-" + Math.abs(hash).toString(36)`，hash 为对完整 URL 的 `(h << 5) - h + charCode | 0` 累积（Java 风格字符串哈希）。content.js 与 background.js 各有一份等价实现。
- **上报体**（POST /api/subtitle）：`{ sessionId, text, tabTitle, platform }`；`text` 可含 `\n`（多元素 join）。
- **服务端会话对象**（sessions.ts 内部）：`{ id, tabTitle, platform, writer, lineCount, startedAt: Date, lastActivity: Date }`。
- **会话列表项**（GET /api/sessions 返回）：`{ id, tabTitle, platform, lineCount, startedAt: ISO字符串 }`。
- **落盘 Markdown 格式**（writer.ts）：
  - 文件名：`{sanitizeFilename(tabTitle)}-{YYYY-MM-DD}.md`，存放于 `{OBSIDIAN_VAULT}/{NOTES_DIR}/`
  - 新文件头：`# {title} — {YYYY年M月D日}\n\n`；同名文件已存在则追加 `\n---\n\n`
  - 每次开始会话追加：`> {HH:mm:ss} 开始捕获\n\n`
  - 字幕行：`{HH:mm:ss} | {line}`，逐行时间戳

## 5. API 契约（扩展 ↔ 服务端 HTTP）

服务端基址：`http://localhost:3210`（常量 `SERVER`/`PORT` 硬编码于 background.js、content.js、index.ts）。请求体上限 `MAX_BODY_SIZE = 1024 * 1024`（1 MB），超限即 `req.destroy()` 并拒绝。

### 5.1 端点总表

| 方法 路径 | 鉴权 | 请求 | 响应 (200) | 错误 |
|-----------|------|------|-----------|------|
| `OPTIONS *` | 仅校验 Origin | — | 204 + CORS 头 | Origin 非扩展 → 403 空体 |
| `GET /api/health` | **免鉴权** | — | `{ status: "ok", uptime: <秒> }` | — |
| `POST /api/subtitle` | Origin+Token | JSON `{ sessionId, text, tabTitle?, platform? }` | `{ ok: true }` | 缺 sessionId/text → 400 `{ error: "sessionId and text required" }`；解析失败 → 500 |
| `POST /api/session` | Origin+Token | JSON `{ sessionId, tabTitle?, platform? }` | `{ ok: true }` | 500 `{ error: "Internal server error" }` |
| `DELETE /api/session/:id` | Origin+Token | — | `{ ok: true }`（幂等） | — |
| `GET /api/sessions` | Origin+Token | — | `{ sessions: [{ id, tabTitle, platform, lineCount, startedAt }] }` | — |
| `POST /api/transcribe` | Origin+Token | 二进制音频体；头 `X-Session-Id`(必)、`X-Tab-Title`(encodeURIComponent 后)、`Content-Type: audio/webm;codecs=opus` | `{ ok: true, text }` | 缺 X-Session-Id → 400；STT 异常 → 500 `{ error: "Transcription failed" }` |
| 其他 | — | — | — | 404 `{ error: "not found" }` |

### 5.2 CORS 与来源校验

```ts
function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return origin.startsWith("chrome-extension://");
}
```

- 响应头（sendJson 统一发出）：`Content-Type: application/json`、`Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`、`Access-Control-Allow-Headers: Content-Type, X-Auth-Token`；仅当 Origin 通过 isValidOrigin 时附加 `Access-Control-Allow-Origin: <origin>`。
- 除 `/api/health` 外，所有端点先做 `if (!isValidOrigin(origin)) → 403 { error: "Forbidden" }`。

### 5.3 Token 鉴权机制（完整说明 + 关键代码逐字收录）

服务端启动时生成一次性随机令牌并写入 `server/.subtitle-token`（SIGINT 退出时删除）；**令牌值随机生成、绝不入库入 git、本文档不收录**：

```ts
// index.ts 顶部（逐字）
const AUTH_TOKEN = crypto.randomBytes(32).toString("hex");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "..", ".subtitle-token");

try {
  fs.writeFileSync(TOKEN_FILE, AUTH_TOKEN, "utf-8");
} catch (err) {
  console.error("[server] Could not write token file:", err);
}
```

```ts
// 校验逻辑（逐字）
function checkAuth(req: http.IncomingMessage): boolean {
  // Chrome extension requests are already validated by origin check
  const origin = req.headers["origin"];
  if (origin && isValidOrigin(origin)) return true;
  // Non-extension requests require the shared-secret token
  const token = req.headers["x-auth-token"];
  return token === AUTH_TOKEN;
}
```

```ts
// SIGINT 清理（逐字）
process.on("SIGINT", () => {
  manager.stopAll();
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    // Token file cleanup is best-effort
  }
  process.exit(0);
});
```

**机制说明**：chrome-extension:// 来源请求凭 Origin 直接放行；其他客户端（如本机脚本）理论上可读取 `.subtitle-token` 文件内容并放入 `X-Auth-Token` 请求头通过 `checkAuth`。**注意逻辑矛盾（已知问题#1）**：路由主流程在 `checkAuth` 之前已执行 `isValidOrigin` 403 拦截，非扩展来源根本到不了 token 校验分支——token 通道实际是死代码，复现时应原样保留此行为。

## 6. 核心业务逻辑

### 6.1 平台识别（platform.js，全文仅 1 个函数，逐字）

```js
function detectPlatform(hostnameOrUrl) {
  if (!hostnameOrUrl) return "unknown";
  if (hostnameOrUrl.includes("feishu") || hostnameOrUrl.includes("larksuite")) return "feishu";
  if (hostnameOrUrl.includes("xiaoe-tech") || hostnameOrUrl.includes("xege")) return "xiaoe";
  return "generic";
}
```

### 6.2 DOM 选择器表（content.js `SELECTORS` 常量，逐字收录）

```js
const SELECTORS = {
  feishu: [
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="live-caption"]',
    '[data-testid*="subtitle"]',
    '[class*="Subtitle"]',
    '[class*="Caption"]',
  ],
  xiaoe: [
    ".subtitle-text",
    ".caption-text",
    '[class*="subtitle"]',
    '[class*="caption"]',
    ".vjs-text-track-display",
    ".player-subtitle",
  ],
  generic: [
    // Video.js subtitles
    ".vjs-text-track-display",
    ".vjs-text-track-cue",
    // Generic subtitle overlays
    '[class*="subtitle"]',
    '[class*="caption"]',
    '[class*="Subtitle"]',
    '[class*="Caption"]',
    // WebVTT rendered
    '[class*="text-track"]',
    '[class*="TextTrack"]',
    // YouTube
    ".ytp-caption-segment",
    ".caption-visual-line",
    // Bilibili
    ".bpx-player-subtitle-wrap",
    ".bilibili-player-video-subtitle",
  ],
};
```

**扫描策略**：`findSubtitleElements(platform)` 取 `SELECTORS[platform] || SELECTORS.generic`；非 generic 平台时将 generic 列表**追加**在平台列表之后作为兜底（`[...selectors, ...SELECTORS.generic]`）。按顺序逐个 `querySelectorAll`，**第一个命中非空结果的选择器即返回**（不再尝试后续），并过滤元素文本：`text && text.length > 0 && text.length < 2000`。选择器异常（非法语法）被 try/catch 吞掉仅 debug 日志。

### 6.3 MutationObserver 策略（逐字关键配置）

```js
observer = new MutationObserver(() => {
  const elements = findSubtitleElements(platform);
  const text = extractText(elements);
  if (text) sendSubtitle(text);
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});
```

回调内不使用 mutation 记录本身，而是每次全量重扫选择器。`extractText` 将各元素 `textContent.trim()` 过滤空串后以 `"\n"` join。

### 6.4 WebVTT 轮询（每 500ms）

`getWebVTTText()`：查询 `track[kind='subtitles'], track[kind='captions']`（逐字选择器）；无 track 或无 `<video>`/`video.textTracks` 时返回 `""`。遍历 `video.textTracks` 中 `mode === "showing"` 的轨道，收集满足 `video.currentTime >= cue.startTime && video.currentTime <= cue.endTime` 的 `cue.text`，join 换行后 trim。

### 6.5 去重逻辑（两级）

1. **客户端**（content.js `sendSubtitle`）：模块级 `lastText` 缓存，`if (!text || text === lastText) return;` —— 全文级精确去重，文本有任何变化即重发全量。停止捕获时 `lastText = ""` 重置。
2. **服务端**：`SessionManager.addSubtitle` 将 text 按 `\n` 拆分、滤空行后计数写盘；**不做内容去重**（`ObsidianWriter.prevText` 字段已声明但从未使用——已知问题#3）。因此 DOM 全量重发会造成输出文件中相邻批次内容重复，属已知行为。

### 6.6 音频转录链路

popup(`startAudioCapture`) → background：`chrome.tabs.get(tabId)` → `ensureOffscreenDocument()`（`chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["USER_MEDIA"], justification: "Capture tab audio for subtitle transcription" })`，"already exists" 错误静默）→ 生成 sessionId → 转发消息给 offscreen → 并行 POST /api/session 注册。offscreen：`chrome.tabCapture.capture({ tabId })` 取流 → `new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" })` → `recorder.start(5000)` 且每 5s 定时器 `requestData()` + 100ms 等待 → 拼 Blob POST `/api/transcribe`（头 `X-Session-Id`、`X-Tab-Title: encodeURIComponent(tabTitle || "")`）→ 服务端 STT 转文字后与 DOM 字幕同路径写盘（platform 记为 `"audio"`）。

### 6.7 边界条件汇总

| # | 边界 | 处理 |
|---|------|------|
| B1 | 服务端未启动 | content.js `startCapture` 先 GET /api/health，失败则**直接 return 不启动**；popup 显示"未连接" |
| B2 | 重复 start | `if (observer) return;` 幂等；启动前清理旧 pollInterval |
| B3 | 标签页关闭 | background `tabs.onRemoved`：广播 stopAudioCapture、DELETE 会话、清 Map |
| B4 | chrome:// 页面 | captureAll/stopAll 跳过 `tab.url.startsWith("chrome://")`；tabCapture 失败发 audioCaptureError |
| B5 | 字幕文本超长 | 元素级过滤 `text.length < 2000` |
| B6 | 请求体超 1MB | 服务端 destroy 连接并 reject |
| B7 | 文件名非法字符 | `sanitizeFilename`：`.replace(/[<>:"/\|?*]/g, "").replace(/\s+/g, " ").trim().substring(0, 30) || "untitled"` |
| B8 | 同日同标题重开 | 文件已存在 → 追加 `\n---\n\n` 分隔而非覆盖 |
| B9 | content script 未注入的标签 | popup `tabs.sendMessage` 抛错被 catch，回退为"未运行"UI |
| B10 | STT 空结果 | `if (text)` 才写盘，仍返回 `{ ok: true, text }` |

## 7. 核心文件逐一说明【主体，覆盖 100% 文件：31 项】

### 7.1 根目录（3 文件）

#### ① `.gitignore`（7 行，全文）

```
node_modules/
dist/
*.crx
*.pem
.DS_Store
server/.subtitle-token
```

#### ② `README.md`

| 项 | 内容 |
|----|------|
| 职责 | 中英双语项目说明，约 349 行 |
| 结构 | 徽章（MV3/TS5/Node18+/Obsidian/MIT）→ Features（英/中）→ Prerequisites → Quick Start（服务端 npm install/start + chrome://extensions 加载）→ Usage（popup 按钮表、输出格式示例）→ ASCII 架构图（Tab×N content.js → background.js → popup + HTTP→ Node 服务端 index/sessions/writer → Obsidian vault notes/）→ Supported Platforms 表 → Configuration（OBSIDIAN_VAULT/NOTES_DIR 表 + bash/PowerShell 示例）→ Project Structure 树 → Contributing → MIT License |
| 要点 | 输出格式示例块：`# Page Title — 2026年5月26日` / `> 14:30:05 开始捕获` / `14:30:06 | Welcome to today's lecture.`；README 的结构树未列出 offscreen/platform/stt 等后加文件（文档滞后，复现以本文档第 3 章为准） |

#### ③ `.github/workflows/ci.yml`（53 行）

| 项 | 内容 |
|----|------|
| 职责 | 双 job CI。`server`：Node 18/20/22 矩阵，`actions/checkout@v4` + `actions/setup-node@v4`（cache: npm, cache-dependency-path: server/package-lock.json），`npm ci` 与 `npx tsc --noEmit`（working-directory: server）。`extension`：node -e 内联脚本校验 manifest.json（必含 manifest_version/name/version 且 manifest_version === 3），再 `node --check` 校验 content.js/background.js/popup.js 语法 |
| 触发 | push/pull_request 到 main |

### 7.2 extension/ 目录（12 文件）

#### ④ `manifest.json`（48 行，**全文逐字收录**）

```json
{
  "manifest_version": 3,
  "name": "Web Subtitle Capture",
  "version": "1.0.0",
  "description": "Capture video subtitles from web pages and save to Obsidian",
  "permissions": ["activeTab", "tabs", "storage", "tabCapture", "offscreen"],
  "host_permissions": ["http://localhost:3210/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "*://*.feishu.com/*",
        "*://*.larksuite.com/*",
        "*://*.xiaoe-tech.com/*",
        "*://*.xege.com/*",
        "*://*.youtube.com/*",
        "*://*.bilibili.com/*",
        "*://*.v.qq.com/*",
        "*://*.youku.com/*",
        "*://*.iqiyi.com/*",
        "*://*.zhihu.com/*",
        "*://*.ixigua.com/*",
        "*://*.douyin.com/*",
        "*://*.huya.com/*",
        "*://*.douyu.com/*",
        "*://*.twitch.tv/*"
      ],
      "js": ["platform.js", "content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "offscreen": {}
}
```

边界：顶层 `"offscreen": {}` 并非标准 manifest 键（offscreen 能力由 permissions 数组授予），Chrome 会告警但忽略；复现时原样保留。

#### ⑤ `platform.js`（8 行）

职责：全局函数 `detectPlatform`，被 content.js 与 popup.js 共用（manifest 中先于 content.js 注入；popup.html 中先于 popup.js 引入）。全文已在 §6.1 逐字收录。边界：入参空值返回 `"unknown"`（仅 popup 状态可能出现，content 侧恒有 hostname）。

#### ⑥ `content.js`（259 行）

| 项 | 内容 |
|----|------|
| 职责 | IIFE 包裹的内容脚本：字幕发现、监听、去重上报、会话注册/注销、消息响应、自动启动 |
| 模块状态 | `const SERVER = "http://localhost:3210"; let sessionId = null; let observer = null; let lastText = ""; let pollInterval = null;` |
| 实现要点 | `generateSessionId()`（reduce 版哈希，见 §4.3）；`SELECTORS`（§6.2 全文）；`findSubtitleElements` / `extractText` / `getWebVTTText`（§6.2–6.4）；`sendSubtitle`（§6.5 去重 + POST /api/subtitle，body 含 sessionId/text/tabTitle=document.title/platform）；`checkServer`（GET /api/health 返回 res.ok）；`startCapture`（健康检查→注册会话→清旧轮询→建 observer→500ms 轮询→立即初扫一次）；`stopCapture`（disconnect、clearInterval、DELETE /api/session/:id、置空 sessionId、`lastText = ""`）；消息监听 start/stop/status（§4.1-B）；尾部 `setTimeout(..., 2000)` 自动检测：发现字幕元素即 `startCapture()` |
| 关键片段 | 哈希（逐字）：`const hash = Array.from(url).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0); return \`tab-${Math.abs(hash).toString(36)}\`;` |
| 边界 | B1/B2/B5/B9；fetch 失败仅 console.warn 不重试不缓冲（丢字幕）；`status` 响应恒 `mode: "dom"` |

#### ⑦ `background.js`（156 行）

| 项 | 内容 |
|----|------|
| 职责 | MV3 Service Worker：popup 命令路由、服务端代理（getSessions/health）、全局广播（captureAll/stopAll）、音频捕获会话簿记（`audioCaptures: Map<tabId, { sessionId, tabTitle }>`）、offscreen 文档生命周期 |
| 实现要点 | 常量 `SERVER = "http://localhost:3210"`；`ensureOffscreenDocument()`（§6.6 参数逐字）；`generateSessionId(url)`（for 循环版哈希，与 content.js 算法等价）；`tabs.onRemoved` 清理（§6.7-B3）；onMessage 七分支见 §4.1-A，异步分支 `return true` 保活 sendResponse |
| 关键片段 | startAudioCapture 转发消息体（逐字字段）：`{ action: "startAudioCapture", tabId: msg.tabId, sessionId, serverUrl: SERVER, tabTitle: tab.title }`；同时 fire-and-forget POST /api/session，body `{ sessionId, tabTitle: tab.title, platform: "audio" }` |
| 边界 | 所有 fetch/sendMessage 均 .catch 吞错仅 debug；getSessions 失败回退 `{ sessions: [] }`；health 失败回退 `{ ok: false }` |

#### ⑧ `offscreen.html`（5 行，全文）

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body><script src="offscreen.js"></script></body>
</html>
```

#### ⑨ `offscreen.js`（110 行）

| 项 | 内容 |
|----|------|
| 职责 | 离屏文档：按 tabId 管理 `captures: Map<tabId, { recorder, sessionId, serverUrl, chunks, tabId, intervalId }>`，音频采集与分段上传 |
| 实现要点 | onMessage 处理 startAudioCapture（async → sendResponse，return true）与 stopAudioCapture；`startCapture`：`await chrome.tabCapture.capture({ tabId })`，流为 null 时广播 `audioCaptureError` 并返回 `{ ok: false, error: "Capture failed" }`；MediaRecorder mimeType `"audio/webm;codecs=opus"`；`ondataavailable` 收 chunks；每 5000ms 定时器：chunks 空则跳过 → `recorder.requestData()` → `await 100ms` → 合并 Blob、清空 chunks → `blob.arrayBuffer()` POST `${serverUrl}/api/transcribe`；`recorder.start(5000)` |
| 上传头（逐字） | `"Content-Type": blob.type, "X-Session-Id": sessionId, "X-Tab-Title": encodeURIComponent(tabTitle || "")` |
| stopCapture | `recorder.stop()`（try/catch）→ `recorder.stream.getTracks().forEach(t => t.stop())` → clearInterval → Map 删除 |
| 边界 | 上传失败仅 console.error（该段音频丢弃）；见第 10 章坑#5（tabCapture API 签名问题） |

#### ⑩ `popup.html`（71 行）

| 项 | 内容 |
|----|------|
| 职责 | 弹窗骨架，`lang="zh-CN"`，引 popup.css；末尾依序引 platform.js、popup.js |
| 结构/ID 清单 | `.header`（h1 "Web Subtitle Capture" + `#server-status.status.disconnected` 初始"未连接"）→ `.mode-selector`（两个 `label.mode-option` 内 radio `name="captureMode"`，value 分别 `dom`(checked，文案"DOM 字幕") / `audio`(文案"音频转录")）→ `.controls`（`#btn-start.btn.primary` "开始捕获当前页"、`#btn-stop.btn.danger` 初始 display:none "停止捕获"）→ 第二组 `.controls`（`#btn-start-all` "全部开始"、`#btn-stop-all` "全部停止"，均 .btn.secondary）→ `#current-info.info`（隐藏；`.label` "当前页面"、`#current-title.value`、`#current-platform.tag`）→ `.section`（h2 "活跃会话" + `#sessions.sessions` 内初始 `.empty` "暂无活跃会话"）→ `#settings-toggle.settings-toggle` "设置" → `#settings.settings`（隐藏；密码框 `#whisper-key` placeholder "sk-..."、下拉 `#whisper-lang`（zh=中文/en=English/空=自动检测）、`#btn-save-settings` "保存设置"）→ `.footer`（"Obsidian: notes/"） |

#### ⑪ `popup.js`（195 行）

| 项 | 内容 |
|----|------|
| 职责 | 弹窗逻辑：3 秒轮询 `refreshStatus()`、按钮事件、模式切换、设置存取 |
| refreshStatus 流程 | ① runtime 消息 `health` → 设置 `#server-status` 文案（"已连接"/"未连接"）与类（connected/disconnected）；② `chrome.tabs.query({ active: true, currentWindow: true })` 得当前 tab；③ 先查 `getAudioCaptureStatus`，若当前 tabId 在册 → 音频模式 UI（勾选 audio radio、显示停止按钮、platform 文案 "audio"）；④ 否则 `tabs.sendMessage(tab.id, { action: "status" })`，按 `status.running` 切换按钮显隐与信息卡；异常回退到"未运行"UI；⑤ `getSessions` 渲染会话列表——**用 DOM API（createElement/textContent）构建，注释明确防 XSS**，每项 `.session` = `.title`(s.tabTitle) + `.count`(s.lineCount + " 条")，空态"暂无活跃会话"，异常态"服务器未连接" |
| 事件 | btn-start/btn-stop：按 `getSelectedMode()` 分派 runtime(startAudioCapture/stopAudioCapture, 带 tabId) 或 tabs(start/stop)，500ms 后刷新；start-all/stop-all → captureAll/stopAll；radio change 更新 `currentMode` 与按钮文案（audio→"开始音频转录"，dom→"开始捕获当前页"）；settings-toggle 切换 display；保存设置 `chrome.storage.sync.set({ whisperKey, whisperLang })`；打开时 `chrome.storage.sync.get` 回填；`refreshStatus(); setInterval(refreshStatus, 3000);` |
| 边界 | `currentTabId` 为 null 时按钮点击直接 return；所有消息异常均 try/catch 回退 |

#### ⑫ `popup.css`（226 行）

职责：视觉样式，无逻辑。要点：`body` 宽 320px、系统字体栈、13px、#fafafa 底；状态胶囊 `.status.connected`（#d4edda/#155724）与 `.disconnected`（#f8d7da/#721c24）；按钮三态 `.primary` #0066ff、`.danger` #dc3545、`.secondary` #e9ecef；`.mode-option` 单选卡片，选中态用 `:has(input:checked)`（#e7f5ff 底 #1971c2 边框字色），radio 本体 `display:none`；`.sessions` max-height 200px 滚动；`.session .title` max-width 180px 省略号；设置面板白底卡片。复现时按此描述+第 8 章 UI 图谱重建即可，无需像素级一致。

#### ⑬⑭⑮ `icons/icon16.png / icon48.png / icon128.png`

占位图标，规格见第 10 章。manifest 的 action.default_icon 与顶层 icons 均引用。

### 7.3 server/ 目录（16 文件）

#### ⑯ `package.json`（**依赖表全文逐字**）

```json
{
  "name": "web-subtitle-capture-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

#### ⑰ `package-lock.json`

npm 对上述 3 个 devDependencies 的锁定树（约 16.9KB），由 `npm install` 自动生成，不手写、不收录内容。CI 的 `npm ci` 依赖其存在。

#### ⑱ `tsconfig.json`（全文）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

#### ⑲ `.env.example`

全文已于第 2 章逐字收录（10 行）。注意：服务端**不含 dotenv**，此文件仅作参考模板。

#### ⑳ `.subtitle-token`（运行时产物）

服务端每次启动随机生成 64 位 hex 令牌写入本文件，SIGINT 时删除；已被 .gitignore 忽略。**真实值不收录**。复现时无需创建——由 index.ts 自动生成。

#### ㉑ `src/index.ts`（221 行）

| 项 | 内容 |
|----|------|
| 职责 | HTTP 入口：常量（PORT=3210、MAX_BODY_SIZE=1MB）、令牌生成（§5.3 逐字）、启动日志（打印 token 值/token 文件路径/STT provider）、CORS 与鉴权（§5.2/5.3）、`readBody`/`readBodyBuffer`（累计超 1MB 即 destroy+reject）、六个路由（§5.1 全表）、SIGINT 清理 |
| 依赖 | `SessionManager`（单例 manager）、`createSTTService()`（启动时构造一次 sttService） |
| 路由顺序（必须保持） | OPTIONS → GET /api/health（免鉴权）→ Origin 403 拦截 → checkAuth 401 拦截 → POST /api/transcribe → POST /api/subtitle → POST /api/session → DELETE /api/session/ 前缀匹配（`url.pathname.split("/").pop()!` 取 id）→ GET /api/sessions → 404 |
| 边界 | /api/transcribe 中 `mimeType = req.headers["content-type"] || "audio/webm"`；STT 结果非空才 `manager.addSubtitle(sessionId, text, tabTitle ?? "untitled", "audio")` |

#### ㉒ `src/sessions.ts`（72 行）

| 项 | 内容 |
|----|------|
| 职责 | `SessionManager` 类 + `Session` 接口（§4.3），私有 `sessions = new Map<string, Session>()` |
| getOrCreate | 不存在则 `new ObsidianWriter(tabTitle)` → 组装 Session（lineCount: 0，两个 Date）→ `writer.beginSession()` → 日志打印新会话与输出文件路径 |
| addSubtitle | `getOrCreate` 后：`text.split("\n").filter((l) => l.trim().length > 0)`，有内容则 `writer.writeLines(lines)`、累加 lineCount、更新 lastActivity，`process.stdout.write(...\r)` 单行进度 |
| stopSession / listSessions / stopAll | 删除并日志 / map 出 §4.3 列表项（startedAt.toISOString()）/ 遍历日志后 clear |
| 边界 | stopSession 幂等；会话不落盘，进程重启即清零（文件仍在） |

#### ㉓ `src/writer.ts`（72 行）

| 项 | 内容 |
|----|------|
| 职责 | `ObsidianWriter`：目录创建、文件名生成、三种写入（头/会话标记/字幕行） |
| 路径常量（逐字） | `const VAULT_PATH = process.env.OBSIDIAN_VAULT ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", "obsidian-vault"); const NOTES_DIR = process.env.NOTES_DIR ?? "notes";` |
| sanitizeFilename（逐字） | `return title.replace(/[<>:"/\|?*]/g, "").replace(/\s+/g, " ").trim().substring(0, 30) || "untitled";` |
| 日期/时间格式 | `formatDate` → `YYYY-MM-DD`（padStart 2 "0"）；`formatTime` → `HH:mm:ss`；`formatDisplayDate` → `` `${y}年${m月不补零}月${d}日` `` |
| 构造器 | `mkdirSync(dir, { recursive: true })`；`filePath = path.join(dir, \`${safeTitle}-${date}.md\`)`；记录 fileExists |
| beginSession | 新文件：标题行 `# {title} — {formatDisplayDate}\n\n`，其中 title 由 basename 去 `.md` 再 `.replace(/-\d{4}-\d{2}-\d{2}$/, "")` 剥日期后缀；旧文件：追加 `\n---\n\n`；两者随后都追加 `> {HH:mm:ss} 开始捕获\n\n` |
| writeLines（逐字核心） | `const content = lines.map((line) => \`${time} | ${line}\`).join("\n") + "\n"; fs.appendFileSync(this.filePath, content, "utf-8");` |
| 边界 | `prevText = ""` 字段声明未用（坑#3）；同步 IO，量大时阻塞事件循环（可接受） |

#### ㉔ `src/stt/types.ts`（全文）

```ts
export interface STTService {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
```

#### ㉕ `src/stt/index.ts`（36 行）

工厂：`const VALID_PROVIDERS = ["mock", "whisper", "tencent", "aliyun", "volcengine", "free"] as const;`（逐字）；`createSTTService()` 读 `process.env.STT_PROVIDER ?? "mock"` 转小写，switch 分发六个实现类；default 分支抛 `Unknown STT_PROVIDER "${provider}". Valid options: ${VALID_PROVIDERS.join(", ")}`。另导出 `STTProvider` 类型与 re-export `STTService`。

#### ㉖ `src/stt/mock.ts`（7 行，核心逐字）

`transcribe` 返回 `` `[音频转录] 模拟识别文本 — ${new Date().toLocaleTimeString()}` ``。默认 provider，无外部依赖，用于端到端联调。

#### ㉗ `src/stt/whisper.ts`（85 行）

| 项 | 内容 |
|----|------|
| 构造 | 读 `WHISPER_API_KEY`，缺失抛 `"WHISPER_API_KEY is not set. Export it before starting the server."` |
| transcribe | 手工拼 multipart/form-data：boundary = `` `----FormBoundary${Date.now().toString(36)}` ``；extMap（逐字键值）：`audio/webm→webm, audio/ogg→ogg, audio/wav→wav, audio/mp3→mp3, audio/mpeg→mp3, audio/mp4→m4a, audio/x-m4a→m4a`，兜底 `webm`；三个字段：`model=whisper-1`、`language=zh`、`file`（filename=`audio.${ext}`，Content-Type=入参 mimeType）；POST `https://api.openai.com/v1/audio/transcriptions`，头 `Authorization: Bearer <key>` + boundary Content-Type |
| 边界 | 非 2xx 抛 `` `Whisper API returned ${status}: ${errorText}` ``；返回 `json.text ?? ""` |

#### ㉘ `src/stt/free.ts`（93 行）

| 项 | 内容 |
|----|------|
| 职责 | 免费/自建后端适配。构造读 `FREE_STT_URL`，默认 `http://localhost:9000/v1/audio/transcriptions`，打印 `[free-stt] Backend URL:` |
| 路由规则（逐字条件） | mime 主类型判 ext（webm/ogg/wav）；`if (this.url.includes("/v1/audio") || this.url.includes("whisper") || this.url.includes("9000"))` → Whisper 兼容分支；`if (this.url.includes("10095") || this.url.includes("funasr"))` → FunASR 分支；否则兜底 Whisper 兼容 |
| Whisper 兼容分支 | 与 whisper.ts 相同的三字段 multipart（boundary 用 `Math.random().toString(36).slice(2)`；file 的 Content-Type 为 `audio/${ext}`）；若存在 `DASHSCOPE_API_KEY` 则加 `Authorization: Bearer` 头；返回 `data.text?.trim() ?? ""`，异常吞错返回 `""` |
| FunASR 分支 | POST `${url}/`，`Content-Type: application/octet-stream`，裸音频体，响应按纯文本 trim 返回 |
| 文件头注释 | 说明三种后端：FunASR docker（端口 10095）、DashScope Paraformer（免费 2h/月）、任意 OpenAI 兼容 Whisper 端点 |

#### ㉙㉚㉛ `src/stt/tencent.ts` / `aliyun.ts` / `volcengine.ts`（35/38/39 行，结构相同的骨架）

三者均为**未实现骨架**：构造器校验各自环境变量对（缺失抛 "`XXX and YYY are required. Export them before starting the server.`"），`transcribe` 直接抛中文错误（依次为 `"腾讯云 STT 未实现，请先实现 transcribe 方法"` / `"阿里云 STT 未实现，请先实现 transcribe 方法"` / `"火山引擎 STT 未实现，请先实现 transcribe 方法"`）。文件头 JSDoc 记录各云 API 端点与鉴权方式：腾讯 `POST https://asr.tencentcloudapi.com`（X-TC-Action: SentenceRecognition、X-TC-Version: 2019-06-14、X-TC-Region: ap-guangzhou、TC3-HMAC-SHA256）；阿里 `POST https://nls-gateway.cn-shanghai.aliyuncs.com`（X-NLS-Token，CreateToken + HMAC-SHA1）；火山 `POST https://openspeech.bytedance.com/api/v1/asr`（`Authorization: Bearer;{access_token}`，请求体 app/user/audio/request 四段，HMAC-SHA256）。复现时保留骨架与注释即可。

## 8. UI 与交互

**Popup（320px 宽单页）自上而下**：

```
┌────────────────────────────────┐
│ Web Subtitle Capture   [未连接] │  ← #server-status 胶囊，3s 轮询变绿"已连接"
│ [ DOM 字幕 ] [ 音频转录 ]        │  ← 单选卡片，切换 btn-start 文案
│ [     开始捕获当前页       ]     │  ← 运行中时换成红色"停止捕获"
│ [  全部开始  ] [  全部停止  ]    │
│ ┌ 当前页面 ─────────────────┐   │  ← 仅捕获中显示：标题 + 平台tag
│ 活跃会话                        │
│ │ 页面标题A            12 条 │   │  ← 来自 GET /api/sessions
│ │ 暂无活跃会话（空态）        │   │
│ 设置 ▾                          │  ← 点击展开
│ │ Whisper API Key [sk-...]  │   │
│ │ 语言 [中文/English/自动]   │   │
│ │ [ 保存设置 ]              │   │
│         Obsidian: notes/        │
└────────────────────────────────┘
```

**交互规则**：打开即 `refreshStatus()` 并每 3s 重复；音频会话状态优先于 DOM 状态展示；会话列表用 DOM API 渲染防 XSS；按钮点击后延迟 500ms（全部操作 1000ms）再刷新。文案全集：已连接/未连接/开始捕获当前页/开始音频转录/停止捕获/全部开始/全部停止/当前页面/活跃会话/暂无活跃会话/服务器未连接/设置/保存设置/`N 条`。

## 9. 从零复现步骤

1. 建目录骨架（第 3 章树），`git init`，写入 `.gitignore`（⑦①全文）。
2. 写 `server/package.json`、`tsconfig.json`（⑯⑱全文），`cd server && npm install` 生成 lock 与 node_modules。
3. 实现 `server/src/writer.ts`（㉓：常量/正则/三种格式逐字）→ `sessions.ts`（㉒）→ `stt/types.ts + mock.ts`（㉔㉖）→ `stt/index.ts` 工厂（㉕）→ `index.ts`（㉑：路由顺序、CORS、token 机制严格照 §5）。
4. 补齐 `stt/whisper.ts、free.ts、tencent.ts、aliyun.ts、volcengine.ts`（㉗–㉛）。写 `.env.example`（§2 全文）。
5. 写 `extension/manifest.json`（④逐字）→ `platform.js`（§6.1）→ `content.js`（⑥：SELECTORS/哈希/观察器配置逐字）→ `background.js`（⑦）→ `offscreen.html/js`（⑧⑨）→ `popup.html/css/js`（⑩⑪⑫）。
6. 生成三枚 PNG 图标（16/48/128，内容任意）放入 `extension/icons/`。
7. 写 `.github/workflows/ci.yml`（③）与 `README.md`（②结构）。
8. **验收标准**：
   - `cd server && npx tsc --noEmit` 零错误；`npm start` 打印 Auth token、Token file 路径、`STT provider: mock`、监听 3210 两行日志；`server/.subtitle-token` 文件出现，Ctrl+C 后消失。
   - `curl http://localhost:3210/api/health` → `{"status":"ok","uptime":...}`；无 Origin 访问 `/api/sessions` → 403 `{"error":"Forbidden"}`。
   - chrome://extensions 加载 extension/ 无报错（仅可能有 offscreen 键警告）；popup 显示"已连接"。
   - 打开 YouTube 视频开字幕 → 2 秒内自动开始或点"开始捕获当前页"→ vault 的 notes/ 下出现 `{标题前30字符}-{日期}.md`，内容含 `# 标题 — YYYY年M月D日`、`> HH:mm:ss 开始捕获`、`HH:mm:ss | 字幕行`；popup 会话列表出现该会话且行数增长。
   - 切"音频转录"模式点开始 → 服务端每 ~5s 收到 /api/transcribe，mock 模式下文件持续写入 `[音频转录] 模拟识别文本 — ...`。
   - 关闭标签页 → GET /api/sessions 中该会话消失。

## 10. 不可文本化资产与已知问题

**不可文本化资产**：`extension/icons/icon16.png`（16×16，81B）、`icon48.png`（48×48，155B）、`icon128.png`（128×128，297B）——极小占位图，内容需另行提供或任意重绘，不影响功能。

**坑与 TODO（复现时保留原行为，除非明确修复）**：

1. **Token 通道死代码**：主流程先按 Origin 403 拦截，非扩展客户端带 `X-Auth-Token` 也到不了 checkAuth（§5.3）。
2. **content.js 直连服务端的 CORS 风险**：content script 的 fetch 携带页面 Origin（如 `https://www.youtube.com`），服务端 isValidOrigin 判假 → /api/subtitle 返回 403 且无 ACAO 头，浏览器亦拦截读取；health 检查同理可能失败导致 DOM 捕获无法启动。经 background 代理的调用（Origin 为 chrome-extension://）不受影响。这是架构级已知问题，修复方向是把 content 的上报改为经 background 转发。
3. `ObsidianWriter.prevText` 声明未用：服务端无内容去重，DOM 全量重发导致输出文件重复段落。
4. popup 设置的 `whisperKey/whisperLang` 存入 chrome.storage.sync 后**无消费方**（服务端读环境变量 WHISPER_API_KEY，语言硬编码 zh）——装饰性设置。
5. `chrome.tabCapture.capture({ tabId })` 非官方签名，且该 API 在 offscreen 文档中不可用；MV3 正确姿势为 background 中 `getMediaStreamId` + offscreen 中 `getUserMedia`。音频链路在新版 Chrome 上可能拿不到流（届时触发 audioCaptureError——而它无监听方，坑#6）。
6. `audioCaptureError` 消息无任何监听方，错误静默。
7. manifest 顶层 `"offscreen": {}` 非标准键（Chrome 警告）。
8. platform.js 匹配 `xege`，manifest 匹配 `*.xege.com`，而 README 写 `xege.org`——三处不一致，以代码为准。
9. tencent/aliyun/volcengine 三个 STT 为 TODO 骨架，选用即抛错。
10. 服务端无 dotenv，.env 文件不会被自动加载；.env.example 中 OBSIDIAN_VAULT 为作者本机路径，复现者需替换。
11. 会话状态存内存，服务端重启后 lineCount 清零、popup 列表清空（文件不受影响）。
