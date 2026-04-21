const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { URL } = require("url");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const tar = require("tar");
const os = require("os");
const stream = require("stream");
const { promisify } = require("util");

const pipeline = promisify(stream.pipeline);
const { Readable } = stream;

let mainWin = null;
let popupWin = null;
let baseUrl = null;
let server = null;
let popupAlwaysOnTop = true;
let popupResizable = true;

// Local LLM (llama.cpp server)
let localServerProc = null;
let localServerStarting = null;
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = Number(process.env.LOCAL_LLM_PORT || 8088);
const QWEN_DEFAULT_URL =
  "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf";
const LLAMA_CPP_BUILD = process.env.LLAMA_CPP_BUILD || "b8850";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch {}
    if (Date.now() - start > timeoutMs) return false;
    await sleep(250);
  }
}

function resolveLlamaServerPath() {
  // Priorité: téléchargement automatique (userData), puis env, puis PATH
  const userBin = path.join(app.getPath("userData"), "local-llm", "bin", process.platform, process.arch);
  const exe = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const candidate = path.join(userBin, exe);
  if (fs.existsSync(candidate)) return candidate;
  if (process.env.LLAMA_SERVER_PATH) return process.env.LLAMA_SERVER_PATH;
  return exe;
}

function resolveQwenModelPath() {
  // Modèle téléchargé automatiquement dans userData, fallback env
  const userModel = path.join(app.getPath("userData"), "local-llm", "models", "qwen2.5-3b-instruct-q4_k_m.gguf");
  if (fs.existsSync(userModel)) return userModel;
  return process.env.QWEN_GGUF_PATH || "";
}

function sendLocalStatus(payload) {
  try {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("local:status", payload);
  } catch {}
}

async function downloadToFile(url, outFile, label) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download_http_${res.status}`);
  const total = Number(res.headers.get("content-length") || "0") || 0;
  let done = 0;

  const file = fs.createWriteStream(outFile);
  if (!res.body) throw new Error("download_no_body");

  // Node/Electron: res.body est un WebStream (pas un Node stream).
  // On le convertit pour pouvoir utiliser pipeline().
  const nodeStream =
    typeof Readable.fromWeb === "function" ? Readable.fromWeb(res.body) : res.body;

  nodeStream.on("data", (chunk) => {
    done += chunk.length;
    if (total > 0) {
      sendLocalStatus({
        stage: label,
        progress: Math.min(100, Math.round((done / total) * 100)),
      });
    }
  });

  await pipeline(nodeStream, file);
  sendLocalStatus({ stage: label, progress: 100 });
}

function llamaReleaseUrl() {
  // Binaries officiels ggml-org/llama.cpp
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_BUILD}/llama-${LLAMA_CPP_BUILD}-bin-macos-${arch}.tar.gz`;
  }
  if (process.platform === "win32") {
    return `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_BUILD}/llama-${LLAMA_CPP_BUILD}-bin-win-cpu-x64.zip`;
  }
  throw new Error("unsupported_platform_for_local_llm");
}

async function ensureLlamaServerDownloaded() {
  const binDir = path.join(app.getPath("userData"), "local-llm", "bin", process.platform, process.arch);
  const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const exePath = path.join(binDir, exeName);
  if (fs.existsSync(exePath)) return exePath;

  sendLocalStatus({ stage: "Téléchargement llama-server…", progress: 0 });

  const url = llamaReleaseUrl();
  const tmpDir = path.join(app.getPath("userData"), "local-llm", "tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  if (process.platform === "win32") {
    const zipPath = path.join(tmpDir, `llama-${LLAMA_CPP_BUILD}.zip`);
    await downloadToFile(url, zipPath, "Téléchargement llama-server…");
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(binDir, true);
  } else {
    const tgzPath = path.join(tmpDir, `llama-${LLAMA_CPP_BUILD}.tar.gz`);
    await downloadToFile(url, tgzPath, "Téléchargement llama-server…");
    fs.mkdirSync(binDir, { recursive: true });
    await tar.x({ file: tgzPath, cwd: binDir, strip: 1 });
    try {
      fs.chmodSync(exePath, 0o755);
    } catch {}
    // macOS: éviter les blocages Gatekeeper sur les binaires téléchargés
    try {
      spawn("xattr", ["-dr", "com.apple.quarantine", binDir], { stdio: "ignore" });
    } catch {}
  }

  if (!fs.existsSync(exePath)) throw new Error("llama_server_missing_after_extract");
  return exePath;
}

async function ensureQwenModelDownloaded() {
  const modelsDir = path.join(app.getPath("userData"), "local-llm", "models");
  const modelPath = path.join(modelsDir, "qwen2.5-3b-instruct-q4_k_m.gguf");
  if (fs.existsSync(modelPath)) return modelPath;

  const url = process.env.QWEN_GGUF_URL || QWEN_DEFAULT_URL;
  sendLocalStatus({ stage: "Téléchargement modèle Qwen…", progress: 0 });
  await downloadToFile(url, modelPath, "Téléchargement modèle Qwen…");
  return modelPath;
}

async function ensureLocalLlmServer() {
  if (localServerProc && localServerProc.exitCode == null) return true;
  if (localServerStarting) return localServerStarting;

  localServerStarting = (async () => {
    try {
      // 100% automatique: télécharge le binaire + le modèle si nécessaire
      await ensureLlamaServerDownloaded();
      await ensureQwenModelDownloaded();

      const modelPath = resolveQwenModelPath();
      const llamaServerPath = resolveLlamaServerPath();

      const args = [
        "-m",
        modelPath,
        "--host",
        LOCAL_HOST,
        "--port",
        String(LOCAL_PORT),
        "--ctx-size",
        String(Number(process.env.LOCAL_LLM_CTX || 4096)),
        "--threads",
        String(Number(process.env.LOCAL_LLM_THREADS || 4)),
      ];

      sendLocalStatus({ stage: "Démarrage du modèle local…", progress: null });
      localServerProc = spawn(llamaServerPath, args, {
        stdio: "ignore",
        env: process.env,
      });

      localServerProc.on("exit", () => {
        localServerProc = null;
      });

      const ok = await waitForHttp(`http://${LOCAL_HOST}:${LOCAL_PORT}/v1/models`, 60000);
      if (!ok) throw new Error("local_llm_server_start_timeout");
      sendLocalStatus({ stage: "Local prêt.", progress: 100 });
      return true;
    } catch (e) {
      sendLocalStatus({ stage: `Erreur local: ${String(e?.message || e)}`, progress: null });
      throw e;
    }
  })();

  try {
    return await localServerStarting;
  } finally {
    localServerStarting = null;
  }
}

// Tentative d'activer la Web Speech API dans Electron (dépend de la plateforme/version).
app.commandLine.appendSwitch("enable-speech-dispatcher");
app.commandLine.appendSwitch("enable-features", "WebSpeechAPI");

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    case ".gz":
    case ".tgz":
      return "application/gzip";
    case ".zip":
      return "application/zip";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function resolveResourcePath(relPath) {
  // En dev: fichiers dans le repo
  // En prod: fichiers dans resources (extraResources)
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, relPath)
    : path.join(__dirname, "..", relPath);
  return candidate;
}

async function startStaticServer() {
  if (server && baseUrl) return baseUrl;
  // En prod, le code (HTML/JS/CSS) est dans app.asar (app.getAppPath()).
  // Les ressources "extraResources" (ex: models/) sont dans process.resourcesPath.
  const appRoot = app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");
  const resourcesRoot = process.resourcesPath;

  server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(u.pathname || "/");
      if (pathname === "/") pathname = "/index.html";

      // IMPORTANT (Windows): les URL utilisent des "/" mais path.normalize() met des "\".
      // Si le chemin commence par "\" ou "/", path.join(root, safePath) ignore root → 404.
      // On normalise en POSIX puis on enlève les séparateurs de tête.
      let safePath = path.posix.normalize(pathname);
      safePath = safePath.replace(/^(\.\.(\/|$))+/, "");
      safePath = safePath.replace(/^\/+/, "");

      // Routage:
      // - en prod (packagé): models/** vient de extraResources (resources/)
      // - en dev: models/** est dans le repo (appRoot)
      // - le reste vient de appRoot (repo en dev, app.asar en prod)
      const root = safePath.startsWith("models/")
        ? app.isPackaged
          ? resourcesRoot
          : appRoot
        : appRoot;
      const filePath = path.join(root, safePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const buf = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": mimeType(filePath) });
      res.end(buf);
    } catch (e) {
      res.writeHead(500);
      res.end("Server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });

  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : null;
  if (!port) throw new Error("static_server_no_port");
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1150,
    height: 820,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // En mode packagé, les assets (vosk.js, models, etc.) sont dans resources/,
  // et on sert via le petit serveur local intégré.
  mainWin.loadURL(`${baseUrl}/index.html`);

  mainWin.on("closed", () => {
    mainWin = null;
    if (popupWin && !popupWin.isDestroyed()) popupWin.close();
    popupWin = null;
  });
}

function createOrFocusPopupWindow() {
  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.show();
    popupWin.focus();
    return;
  }

  popupWin = new BrowserWindow({
    width: 520,
    height: 280,
    frame: false, // frameless
    transparent: true, // allow transparent background
    resizable: popupResizable,
    alwaysOnTop: popupAlwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popupWin.loadURL(`${baseUrl}/popup.html`);

  popupWin.on("closed", () => {
    popupWin = null;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("popup:closed");
    }
  });
}

app.whenReady().then(async () => {
  await startStaticServer();

  // Autoriser l'accès au micro (getUserMedia) dans l'app.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow =
      permission === "media" ||
      permission === "microphone" ||
      permission === "audioCapture" ||
      permission === "videoCapture";
    callback(Boolean(allow));
  });

  createMainWindow();

  ipcMain.handle("popup:openOrFocus", () => {
    createOrFocusPopupWindow();
    return true;
  });

  ipcMain.handle("popup:close", () => {
    if (popupWin && !popupWin.isDestroyed()) popupWin.close();
    popupWin = null;
    return true;
  });

  ipcMain.handle("popup:setAlwaysOnTop", (_ev, enabled) => {
    popupAlwaysOnTop = Boolean(enabled);
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.setAlwaysOnTop(popupAlwaysOnTop);
    }
    return popupAlwaysOnTop;
  });

  ipcMain.handle("popup:setResizable", (_ev, enabled) => {
    popupResizable = Boolean(enabled);
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.setResizable(popupResizable);
    }
    return popupResizable;
  });

  ipcMain.on("popup:state", (_ev, payload) => {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.webContents.send("popup:state", payload);
    }
  });

  ipcMain.handle("translate:chunk", async (_ev, payload) => {
    const provider = payload?.provider;
    const sl = payload?.sl || "auto";
    const tl = payload?.tl || "en";
    const text = String(payload?.text || "").trim();
    if (!text) return { translated: "", detected: null };

    if (provider === "local") {
      await ensureLocalLlmServer();
      const model = process.env.LOCAL_LLM_MODEL || "qwen2.5-3b-instruct";

      const res = await fetch(`http://${LOCAL_HOST}:${LOCAL_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Tu es un moteur de traduction. Réponds uniquement avec la traduction, sans guillemets, sans explication.",
            },
            { role: "user", content: `Traduis du ${sl} vers ${tl}:\n${text}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`local_llm_http_${res.status}`);
      const data = await res.json();
      const translated = data?.choices?.[0]?.message?.content?.trim?.() || "";
      return { translated, detected: null };
    }

    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      if (!apiKey) throw new Error("OPENAI_API_KEY_missing");

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Tu es un moteur de traduction. Réponds uniquement avec la traduction, sans guillemets, sans explication.",
            },
            {
              role: "user",
              content: `Traduis du ${sl} vers ${tl}:\n${text}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai_http_${res.status}`);
      const data = await res.json();
      const translated = data?.choices?.[0]?.message?.content?.trim?.() || "";
      return { translated, detected: null };
    }

    if (provider === "gemini") {
      const apiKey = process.env.GOOGLE_API_KEY;
      const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      if (!apiKey) throw new Error("GOOGLE_API_KEY_missing");

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Tu es un moteur de traduction. Réponds uniquement avec la traduction, sans explication.\n" +
                    `Traduis du ${sl} vers ${tl}:\n${text}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!res.ok) throw new Error(`gemini_http_${res.status}`);
      const data = await res.json();
      const translated =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || "";
      return { translated, detected: null };
    }

    throw new Error("unknown_provider");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  try {
    server?.close?.();
  } catch {}
  server = null;
});

