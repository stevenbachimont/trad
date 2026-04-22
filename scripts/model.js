const fs = require("fs");
const path = require("path");
const https = require("https");
const AdmZip = require("adm-zip");
const tar = require("tar");

const MODELS = {
  fr: {
    small: {
      zipUrl:
        "https://huggingface.co/rhasspy/vosk-models/resolve/main/fr/vosk-model-small-fr-0.22.zip",
      extractedDir: "vosk-model-small-fr-0.22",
    },
    big: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-fr-0.22.zip",
      extractedDir: "vosk-model-fr-0.22",
    },
  },
  en: {
    small: {
      zipUrl:
        "https://huggingface.co/rhasspy/vosk-models/resolve/main/en/vosk-model-small-en-us-0.15.zip",
      extractedDir: "vosk-model-small-en-us-0.15",
    },
    lgraph: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip",
      extractedDir: "vosk-model-en-us-0.22-lgraph",
    },
    big: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip",
      extractedDir: "vosk-model-en-us-0.22",
    },
  },
  es: {
    small: {
      zipUrl:
        "https://huggingface.co/rhasspy/vosk-models/resolve/main/es/vosk-model-small-es-0.42.zip",
      extractedDir: "vosk-model-small-es-0.42",
    },
    big: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-es-0.42.zip",
      extractedDir: "vosk-model-es-0.42",
    },
  },
  de: {
    small: {
      zipUrl:
        "https://huggingface.co/rhasspy/vosk-models/resolve/main/de/vosk-model-small-de-0.15.zip",
      extractedDir: "vosk-model-small-de-0.15",
    },
    big: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-de-0.21.zip",
      extractedDir: "vosk-model-de-0.21",
    },
  },
  it: {
    small: {
      zipUrl:
        "https://huggingface.co/rhasspy/vosk-models/resolve/main/it/vosk-model-small-it-0.22.zip",
      extractedDir: "vosk-model-small-it-0.22",
    },
    big: {
      zipUrl:
        "https://alphacephei.com/vosk/models/vosk-model-it-0.22.zip",
      extractedDir: "vosk-model-it-0.22",
    },
  },
};

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, outFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outFile);
    let lastLogAt = 0;
    let bytes = 0;
    let total = 0;

    const req = https.get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          fs.rmSync(outFile, { force: true });
          return resolve(download(res.headers.location, outFile));
        }
        if (res.statusCode !== 200) {
          file.close();
          return reject(new Error(`download_failed_http_${res.statusCode}`));
        }
        total = Number(res.headers["content-length"] || "0") || 0;
        console.log(
          `Téléchargement… ${url}` +
            (total ? ` (${(total / (1024 * 1024)).toFixed(0)} MB)` : ""),
        );

        res.on("data", (chunk) => {
          bytes += chunk.length;
          const now = Date.now();
          // Log ~1x/sec pour ne pas spammer le terminal.
          if (now - lastLogAt < 1000) return;
          lastLogAt = now;
          if (total) {
            const pct = Math.min(100, (bytes / total) * 100);
            process.stdout.write(
              `\r  ${(bytes / (1024 * 1024)).toFixed(0)} / ${(total / (1024 * 1024)).toFixed(
                0,
              )} MB (${pct.toFixed(1)}%)`,
            );
          } else {
            process.stdout.write(`\r  ${(bytes / (1024 * 1024)).toFixed(0)} MB`);
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          process.stdout.write("\n");
          file.close(resolve);
        });
      });

    // Timeout “dur” (utile si connexion bloquée).
    req.setTimeout(60_000, () => {
      try {
        req.destroy(new Error("download_timeout"));
      } catch {}
    });

    req.on("error", (err) => {
        try {
          file.close();
        } catch {}
        reject(err);
      });
  });
}

async function buildOne(lang) {
  const spec = MODELS[lang];
  if (!spec) throw new Error(`unknown_lang_${lang}`);

  const sizeArg = String(process.argv[3] || process.env.VOSK_MODEL_SIZE || "small").toLowerCase();
  const size = ["small", "big", "lgraph"].includes(sizeArg) ? sizeArg : "small";
  const chosen = spec[size] || spec.small;

  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "models", lang, size);
  const legacyOutDir = path.join(root, "models", lang);
  const zipPath = path.join(outDir, "model.zip");
  const tmpDir = path.join(outDir, "tmp");
  const modelDir = path.join(outDir, "model");
  const tarGzPath = path.join(outDir, "model.tar.gz");
  const legacyTarGzPath = path.join(legacyOutDir, "model.tar.gz");

  mkdirp(outDir);

  await download(chosen.zipUrl, zipPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(modelDir, { recursive: true, force: true });
  mkdirp(tmpDir);
  mkdirp(modelDir);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmpDir, true);

  const extractedRoot = path.join(tmpDir, chosen.extractedDir);
  if (!fs.existsSync(extractedRoot)) throw new Error("extracted_root_missing");

  for (const entry of fs.readdirSync(extractedRoot)) {
    fs.renameSync(path.join(extractedRoot, entry), path.join(modelDir, entry));
  }

  fs.rmSync(tarGzPath, { force: true });
  await tar.c(
    {
      gzip: true,
      file: tarGzPath,
      cwd: outDir,
      portable: true,
    },
    ["model"],
  );

  // Compat: l’app historique cherchait `models/<lang>/model.tar.gz`.
  // On garde ce chemin pour le modèle small (par défaut).
  if (size === "small") {
    mkdirp(legacyOutDir);
    try {
      fs.copyFileSync(tarGzPath, legacyTarGzPath);
    } catch {}
  }

  console.log(`OK (${lang}, ${size}): ${tarGzPath}`);
}

async function main() {
  const arg = (process.argv[2] || "fr").toLowerCase();
  if (arg === "all") {
    for (const lang of ["fr", "en", "es", "de", "it"]) {
      await buildOne(lang);
    }
    return;
  }
  await buildOne(arg);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

