const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { URL } = require("url");
const https = require("https");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const tar = require("tar");

let mainWin = null;
let popupWin = null;
let baseUrl = null;
let server = null;
let popupAlwaysOnTop = true;
let popupResizable = true;

// Traduction locale via llama.cpp (téléchargé au 1er lancement)
const LLAMA_RELEASE = "b8696";
const LLAMA_PORT = 11437;
let llamaProc = null;
let llamaStarting = null;
let llamaLogTail = [];
const LLAMA_LOG_MAX = 80;

// Modèle par défaut: GGUF "LLM classique" (compatible llama.cpp/llama-server).
// NOTE: les modèles type T5 (ex: MADLAD) peuvent ne pas être supportés par llama-server
// selon la build → démarrage bloqué/échec.
const DEFAULT_GGUF_URL =
  "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf";
const DEFAULT_GGUF_FILENAME = "qwen2.5-3b-instruct-q4_k_m.gguf";

// Tentative d'activer la Web Speech API dans Electron (dépend de la plateforme/version).
app.commandLine.appendSwitch("enable-speech-dispatcher");
app.commandLine.appendSwitch("enable-features", "WebSpeechAPI");

function sendLocalStatus(message) {
  try {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send("local:status", String(message || ""));
    }
  } catch {
    // ignore
  }
}

function pushLlamaLog(line) {
  const s = String(line || "").trimEnd();
  if (!s) return;
  llamaLogTail.push(s);
  if (llamaLogTail.length > LLAMA_LOG_MAX) {
    llamaLogTail = llamaLogTail.slice(-LLAMA_LOG_MAX);
  }
}

function lastLlamaLog(lines = 12) {
  return llamaLogTail.slice(-lines).join("\n");
}

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

function downloadToFile(url, outFile) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const file = fs.createWriteStream(outFile);
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          fs.rmSync(outFile, { force: true });
          return resolve(downloadToFile(res.headers.location, outFile));
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`download_failed_http_${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        try {
          file.close();
        } catch {}
        reject(err);
      });
  });
}

async function ensureLlamaServerBinary() {
  const userData = app.getPath("userData");
  const baseDir = path.join(userData, "llama.cpp", LLAMA_RELEASE);
  const platform = process.platform;
  const arch = process.arch;

  let assetUrl = null;
  let kind = null; // "zip" | "targz"

  if (platform === "darwin") {
    kind = "targz";
    assetUrl =
      arch === "arm64"
        ? `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-arm64.tar.gz`
        : `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-macos-x64.tar.gz`;
  } else if (platform === "win32") {
    kind = "zip";
    // CPU x64 par défaut (laptops)
    assetUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}/llama-${LLAMA_RELEASE}-bin-win-cpu-x64.zip`;
  } else {
    throw new Error(`unsupported_platform_${platform}`);
  }

  const extractDir = path.join(baseDir, "bin");
  const serverName = platform === "win32" ? "llama-server.exe" : "llama-server";

  // Il y a parfois un sous-dossier, donc on cherche récursivement après extraction.
  const marker = path.join(extractDir, ".installed");
  if (fs.existsSync(marker)) {
    // Best-effort: chercher le binaire au même endroit qu'avant
    const candidate = path.join(extractDir, serverName);
    if (fs.existsSync(candidate)) return candidate;
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  const archivePath = path.join(baseDir, kind === "zip" ? "llama.zip" : "llama.tar.gz");
  sendLocalStatus("Local intégré: téléchargement du runtime (llama.cpp)...");
  await downloadToFile(assetUrl, archivePath);
  sendLocalStatus("Local intégré: installation du runtime...");

  if (kind === "zip") {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(extractDir, true);
  } else {
    await tar.x({ file: archivePath, cwd: extractDir, gzip: true });
  }

  // Trouver llama-server dans l'arborescence
  function findBin(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const f = findBin(p);
        if (f) return f;
      } else if (entry.isFile() && entry.name === serverName) {
        return p;
      }
    }
    return null;
  }

  const found = findBin(extractDir);
  if (!found) throw new Error("llama_server_not_found_after_extract");

  // Sur mac, s'assurer que c'est exécutable
  if (platform !== "win32") {
    try {
      fs.chmodSync(found, 0o755);
    } catch {}
  }

  fs.writeFileSync(marker, "ok");
  return found;
}

async function ensureGgufModel() {
  const userData = app.getPath("userData");
  const modelsDir = path.join(userData, "models");
  const url = process.env.LOCAL_TRANSLATE_GGUF_URL || DEFAULT_GGUF_URL;
  const filename = process.env.LOCAL_TRANSLATE_GGUF_FILE || DEFAULT_GGUF_FILENAME;
  const outPath = path.join(modelsDir, filename);
  if (fs.existsSync(outPath)) return outPath;
  sendLocalStatus("Local intégré: téléchargement du modèle de traduction (GGUF)...");
  await downloadToFile(url, outPath);
  sendLocalStatus("Local intégré: modèle téléchargé.");
  return outPath;
}

function isPortOpen(url) {
  return fetch(url, { method: "GET" })
    .then((r) => r.ok || r.status === 404)
    .then(() => true)
    .catch(() => false);
}

async function ensureLlamaRunning() {
  if (await isPortOpen(`http://127.0.0.1:${LLAMA_PORT}/v1/models`)) return true;
  if (llamaStarting) return llamaStarting;

  llamaStarting = (async () => {
    const binPath = await ensureLlamaServerBinary();
    const modelPath = await ensureGgufModel();

    // Démarre llama-server local
    sendLocalStatus("Local intégré: démarrage du serveur de traduction...");
    llamaLogTail = [];
    const args = [
      "--host",
      "127.0.0.1",
      "--port",
      String(LLAMA_PORT),
      "-m",
      modelPath,
      "-c",
      process.env.LOCAL_TRANSLATE_CTX || "2048",
      "--no-mmap",
    ];

    llamaProc = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    llamaProc.stdout?.on?.("data", (buf) => {
      const txt = buf.toString("utf8");
      for (const line of txt.split(/\r?\n/)) pushLlamaLog(line);
    });
    llamaProc.stderr?.on?.("data", (buf) => {
      const txt = buf.toString("utf8");
      for (const line of txt.split(/\r?\n/)) pushLlamaLog(line);
    });

    let exited = false;
    let exitCode = null;
    let exitSignal = null;
    llamaProc.on("exit", () => {
      llamaProc = null;
      exited = true;
    });
    llamaProc.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });

    // Attendre que le serveur réponde
    const deadline = Date.now() + 120000;
    let lastTick = 0;
    while (Date.now() < deadline) {
      if (exited) {
        const tail = lastLlamaLog(20);
        throw new Error(
          `llama_server_exited code=${exitCode} signal=${exitSignal}\n${tail}`,
        );
      }

      // /v1/models est généralement présent; /health peut ne pas l'être
      if (await isPortOpen(`http://127.0.0.1:${LLAMA_PORT}/v1/models`)) {
        sendLocalStatus("Local intégré: prêt.");
        return true;
      }

      const now = Date.now();
      if (now - lastTick > 2500) {
        lastTick = now;
        sendLocalStatus("Local intégré: démarrage du serveur de traduction... (chargement modèle)");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`llama_server_start_timeout\n${lastLlamaLog(30)}`);
  })().finally(() => {
    llamaStarting = null;
  });

  return llamaStarting;
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

    if (provider === "llamacpp") {
      try {
        await ensureLlamaRunning();
      } catch (e) {
        sendLocalStatus(`Local intégré: erreur\n${String(e?.message || e)}`);
        throw e;
      }
      // Utilise /v1/completions (plus robuste pour modèles non-chat)
      const prompt =
        "Tu es un moteur de traduction. Réponds uniquement avec la traduction, sans explication, sans guillemets.\n" +
        `Langue source: ${sl}\nLangue cible: ${tl}\nTexte: ${text}\nTraduction:`;

      const res = await fetch(`http://127.0.0.1:${LLAMA_PORT}/v1/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local",
          temperature: 0.2,
          prompt,
          stop: ["\n"],
          max_tokens: 512,
        }),
      });
      if (!res.ok) throw new Error(`llamacpp_http_${res.status}`);
      const data = await res.json();
      const translated = String(data?.choices?.[0]?.text || "").trim();
      return { translated, detected: null };
    }

    if (provider === "ollama") {
      // Traduction locale via Ollama (http://127.0.0.1:11434)
      // Modèle par défaut: petit et rapide pour laptops 16GB
      const model = process.env.OLLAMA_MODEL || "qwen2.5:3b";

      const prompt =
        "Tu es un moteur de traduction. Réponds uniquement avec la traduction, sans explication.\n" +
        `Langue source: ${sl}\nLangue cible: ${tl}\nTexte: ${text}\nTraduction:`;

      let res;
      try {
        res = await fetch("http://127.0.0.1:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: {
              temperature: 0.2,
            },
          }),
        });
      } catch (e) {
        const cause = e?.cause;
        if (cause?.code === "ECONNREFUSED") {
          throw new Error("ollama_not_running");
        }
        throw e;
      }

      if (!res.ok) throw new Error(`ollama_http_${res.status}`);
      const data = await res.json();
      const translated = String(data?.response || "").trim();
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
    llamaProc?.kill?.();
  } catch {}
  llamaProc = null;
});

app.on("will-quit", () => {
  try {
    server?.close?.();
  } catch {}
  server = null;
});

