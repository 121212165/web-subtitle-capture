# Reconstruction Plan: web-subtitle-capture

> "The best part is no part." — Elon Musk

## Diagnosis

**Core problem**: Capture subtitle text from web videos → save as timestamped Markdown.

**Current state**: 18 files, ~1,774 lines. Includes a full audio transcription subsystem (6 STT providers, offscreen document, MediaRecorder pipeline) that **does not serve the core problem**. 3 of 6 STT providers are unimplemented stubs. Auth token system adds complexity for localhost-only communication.

**Target state**: 10 files, ~725 lines. Pure DOM subtitle capture + Markdown writer. Zero feature loss for the stated problem.

**Cut ratio**: 59% of files deleted, ~59% of lines removed.

---

## Files to DELETE (8 files, ~539 lines)

| File | Lines | Reason |
|------|-------|--------|
| `server/src/stt/` (entire directory) | 7 files | Audio transcription is not the core problem. 3 of 6 providers (tencent, aliyun, volcengine) are unimplemented stubs. Delete the whole subsystem. |
| `server/src/stt/types.ts` | 3 | Part of STT subsystem |
| `server/src/stt/index.ts` | 36 | Part of STT subsystem |
| `server/src/stt/mock.ts` | 7 | Part of STT subsystem |
| `server/src/stt/free.ts` | 93 | Part of STT subsystem |
| `server/src/stt/whisper.ts` | 85 | Part of STT subsystem |
| `server/src/stt/tencent.ts` | 35 | Unimplemented stub |
| `server/src/stt/aliyun.ts` | 38 | Unimplemented stub |
| `server/src/stt/volcengine.ts` | 39 | Unimplemented stub |
| `extension/offscreen.html` | 5 | Only exists for audio capture |
| `extension/offscreen.js` | 110 | Only exists for audio capture |

**Why**: The first-principles document says "subtitles are existing text." Audio-to-text transcription is a fundamentally different product. It requires API keys, cloud services, audio encoding, and a separate offscreen document. None of this helps capture DOM subtitles. Cut it entirely.

---

## Files to MODIFY (5 files)

### 1. `extension/manifest.json` (~48 → 47 lines)

Remove `offscreen` permission (no longer needed):

```diff
- "permissions": ["activeTab", "tabs", "storage", "tabCapture", "offscreen"],
+ "permissions": ["activeTab", "tabs", "storage"],
```

Remove `"offscreen": {}` declaration at end of file.

### 2. `server/src/index.ts` (~221 → 105 lines, -116 lines)

**Remove**:
- `import crypto` — no auth token needed
- `AUTH_TOKEN` generation and `TOKEN_FILE` writing (lines 14-27) — localhost doesn't need shared-secret auth
- `readBodyBuffer()` function (lines 65-81) — only used by `/api/transcribe`
- `checkAuth()` function (lines 83-90) — replaced by origin-only check
- Entire `POST /api/transcribe` handler (lines 131-157) — STT deleted
- Auth gate before endpoints (lines 126-129) — origin check is sufficient for localhost
- `fs.unlinkSync(TOKEN_FILE)` from SIGINT handler (lines 216-218)
- `import { createSTTService } from "./stt/index.js"` — STT deleted
- `const sttService = createSTTService()` — STT deleted
- `console.log` for STT provider and token file (lines 26-27)

**Keep**: Health check, `/api/subtitle`, `/api/session`, `/api/sessions`, CORS handling, origin validation. These are the core data path.

### 3. `extension/background.js` (~156 → 55 lines, -101 lines)

**Remove**:
- `audioCaptures` Map (line 7)
- `ensureOffscreenDocument()` function (lines 9-22)
- `generateSessionId()` function (lines 24-30) — content.js already generates its own
- Audio cleanup in `onRemoved` listener (lines 34-36) — just log the tab close
- `startAudioCapture` handler (lines 100-129)
- `stopAudioCapture` handler (lines 131-146)
- `getAudioCaptureStatus` handler (lines 148-155)

**Keep**: `getSessions`, `health`, `captureAll`, `stopAll` handlers + tab close cleanup (simplified).

### 4. `extension/popup.html` (~71 → 50 lines, -21 lines)

**Remove**:
- Entire `.mode-selector` div (lines 13-22) — no audio mode
- Entire `.settings` div (lines 48-62) — no Whisper config

**Keep**: Header, server status, start/stop buttons, session list, footer.

### 5. `extension/popup.js` (~195 → 90 lines, -105 lines)

**Remove**:
- `modeRadios`, `whisperKeyInput`, `whisperLangSelect`, `btnSaveSettings`, `settingsToggle`, `settingsDiv` DOM refs (lines 10-15)
- `currentMode` variable (line 18)
- `getSelectedMode()` function (lines 22-25)
- `updateButtonLabels()` function (lines 27-33)
- Audio status check block in `refreshStatus()` (lines 57-73) — ~16 lines
- Mode-specific logic in start/stop handlers (lines 136-140, 146-150)
- Mode radio change handler (lines 166-172)
- Settings toggle handler (lines 175-177)
- Settings save handler (lines 180-185)
- Settings load on open (lines 188-191)

**Keep**: Server health check, current tab status, session list rendering, start/stop/startAll/stopAll handlers (simplified to DOM-only), auto-refresh.

---

## Files to KEEP UNCHANGED (7 files, ~706 lines)

| File | Lines | Role |
|------|-------|------|
| `extension/content.js` | 259 | Core: MutationObserver + WebVTT polling + server POST |
| `extension/platform.js` | 8 | Shared platform detection |
| `extension/popup.css` | 226 | Popup styling (minor dead CSS for removed elements is acceptable) |
| `extension/icons/*` | — | Extension icons |
| `server/src/sessions.ts` | 72 | Session manager — clean, no changes needed |
| `server/src/writer.ts` | 72 | Obsidian Markdown writer — clean, no changes needed |
| `server/package.json` | 13 | Zero runtime deps — already minimal |
| `server/tsconfig.json` | 13 | TypeScript config |
| `.gitignore` | 6 | Git ignore rules |
| `.github/workflows/ci.yml` | 52 | CI pipeline |
| `README.md` | 348 | Documentation (update separately if needed) |

---

## Execution Order

### Step 1: Delete STT subsystem (server)

```
DELETE server/src/stt/types.ts
DELETE server/src/stt/index.ts
DELETE server/src/stt/mock.ts
DELETE server/src/stt/free.ts
DELETE server/src/stt/whisper.ts
DELETE server/src/stt/tencent.ts
DELETE server/src/stt/aliyun.ts
DELETE server/src/stt/volcengine.ts
DELETE server/src/stt/           (directory)
```

### Step 2: Delete offscreen documents (extension)

```
DELETE extension/offscreen.html
DELETE extension/offscreen.js
```

### Step 3: Gut server/src/index.ts

Strip auth token system, readBodyBuffer, /api/transcribe endpoint, STT imports. Keep only: health, subtitle, session, sessions endpoints with CORS.

### Step 4: Gut extension/background.js

Strip all audio capture logic. Keep only: getSessions, health, captureAll, stopAll message handlers + simplified tab close cleanup.

### Step 5: Simplify extension/manifest.json

Remove `tabCapture`, `offscreen` permissions. Remove `offscreen` declaration.

### Step 6: Simplify extension/popup.html

Remove mode selector and settings panel.

### Step 7: Simplify extension/popup.js

Strip audio mode, Whisper settings, mode switching. Keep core session management UI.

### Step 8: Verify

```bash
cd server && npx tsc --noEmit    # TypeScript check
node --check extension/content.js
node --check extension/background.js
node --check extension/popup.js
node -e "require('./extension/manifest.json')"
```

---

## Expected Final State

| Metric | Before | After |
|--------|--------|-------|
| Total files | 18 | 10 |
| Extension files | 10 | 8 |
| Server files | 8 (incl. 7 STT) | 4 |
| Total lines | ~1,774 | ~725 |
| Lines cut | — | ~1,049 (59%) |
| Runtime dependencies | 0 | 0 |
| STT providers | 6 (3 broken) | 0 |
| Features lost | — | None (audio transcription was never the core problem) |

### Final file tree

```
web-subtitle-capture/
├── extension/
│   ├── manifest.json          # 47 lines
│   ├── content.js             # 259 lines (unchanged)
│   ├── background.js          # 55 lines
│   ├── popup.html             # 50 lines
│   ├── popup.js               # 90 lines
│   ├── popup.css              # 226 lines (unchanged)
│   ├── platform.js            # 8 lines (unchanged)
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── server/
│   ├── package.json           # 13 lines (unchanged)
│   ├── tsconfig.json          # 13 lines (unchanged)
│   └── src/
│       ├── index.ts           # 105 lines
│       ├── sessions.ts        # 72 lines (unchanged)
│       └── writer.ts          # 72 lines (unchanged)
├── .gitignore
├── .github/workflows/ci.yml
├── README.md
├── FIRST-PRINCIPLES-RECONSTRUCTION.md
└── RECONSTRUCTION-PLAN.md
```

---

## What We're NOT Doing

- **Not rewriting content.js** — it's already clean. MutationObserver + WebVTT polling + platform selectors. Done.
- **Not rewriting writer.ts** — Obsidian Markdown output with timestamps. Done.
- **Not rewriting sessions.ts** — Map-based session manager. Done.
- **Not adding TypeScript to extension** — plain JS is correct for Chrome extensions. No build step needed.
- **Not adding tests** — the CI already validates manifest + syntax. The tool is simple enough that manual testing on one video page proves correctness.
- **Not adding audio transcription back** — if needed later, it's a separate feature branch, not core infrastructure.

---

## Post-Reconstruction: .env.example Update

Simplify to only the relevant variables:

```
# Obsidian vault path
OBSIDIAN_VAULT=C:\Users\lenovo\Documents\Obsidian\explorer
NOTES_DIR=notes
```

Remove all STT_PROVIDER, FREE_STT_URL, WHISPER_API_KEY, TENCENT_*, ALIYUN_*, VOLCENGINE_* variables.
