const fs = require("fs");
const path = require("path");
const https = require("https");
const AdmZip = require("adm-zip");
const tar = require("tar");

const MODELS = {
  fr: {
    zipUrl:
      "https://huggingface.co/rhasspy/vosk-models/resolve/main/fr/vosk-model-small-fr-0.22.zip",
    extractedDir: "vosk-model-small-fr-0.22",
  },
  en: {
    zipUrl:
      "https://huggingface.co/rhasspy/vosk-models/resolve/main/en/vosk-model-small-en-us-0.15.zip",
    extractedDir: "vosk-model-small-en-us-0.15",
  },
  es: {
    zipUrl:
      "https://huggingface.co/rhasspy/vosk-models/resolve/main/es/vosk-model-small-es-0.42.zip",
    extractedDir: "vosk-model-small-es-0.42",
  },
  de: {
    zipUrl:
      "https://huggingface.co/rhasspy/vosk-models/resolve/main/de/vosk-model-small-de-0.15.zip",
    extractedDir: "vosk-model-small-de-0.15",
  },
  it: {
    zipUrl:
      "https://huggingface.co/rhasspy/vosk-models/resolve/main/it/vosk-model-small-it-0.22.zip",
    extractedDir: "vosk-model-small-it-0.22",
  },
};

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, outFile) {
  return new Promise((resolve, reject) => {
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
          return resolve(download(res.headers.location, outFile));
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

async function buildOne(lang) {
  const spec = MODELS[lang];
  if (!spec) throw new Error(`unknown_lang_${lang}`);

  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "models", lang);
  const zipPath = path.join(outDir, "model.zip");
  const tmpDir = path.join(outDir, "tmp");
  const modelDir = path.join(outDir, "model");
  const tarGzPath = path.join(outDir, "model.tar.gz");

  mkdirp(outDir);

  await download(spec.zipUrl, zipPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(modelDir, { recursive: true, force: true });
  mkdirp(tmpDir);
  mkdirp(modelDir);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmpDir, true);

  const extractedRoot = path.join(tmpDir, spec.extractedDir);
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

  console.log(`OK (${lang}): ${tarGzPath}`);
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

