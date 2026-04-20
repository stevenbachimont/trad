const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { URL } = require("url");

let mainWin = null;
let popupWin = null;
let baseUrl = null;
let server = null;
let popupAlwaysOnTop = true;
let popupResizable = true;

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
  const appRoot = app.getAppPath();
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

      // Routage: models/** vient de extraResources, le reste depuis app.asar
      const root = safePath.startsWith("models/") ? resourcesRoot : appRoot;
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

