const fs = require("fs");
const path = require("path");
const https = require("https");
const AdmZip = require("adm-zip");
const tar = require("tar");

const MODEL_ZIP_URL =
  "https://huggingface.co/rhasspy/vosk-models/resolve/main/fr/vosk-model-small-fr-0.22.zip";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, outFile) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outFile);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(outFile);
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

async function main() {
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "models", "fr");
  const zipPath = path.join(outDir, "model.zip");
  const tmpDir = path.join(outDir, "tmp");
  const modelDir = path.join(outDir, "model");
  const tarGzPath = path.join(outDir, "model.tar.gz");

  mkdirp(outDir);

  // Download
  await download(MODEL_ZIP_URL, zipPath);

  // Clean tmp/model
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(modelDir, { recursive: true, force: true });
  mkdirp(tmpDir);
  mkdirp(modelDir);

  // Extract zip to tmp
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmpDir, true);

  // Move extracted folder contents into model/
  const extractedRoot = path.join(tmpDir, "vosk-model-small-fr-0.22");
  if (!fs.existsSync(extractedRoot)) {
    throw new Error("extracted_root_missing");
  }
  for (const entry of fs.readdirSync(extractedRoot)) {
    fs.renameSync(path.join(extractedRoot, entry), path.join(modelDir, entry));
  }

  // Create model.tar.gz containing a top-level "model/" folder
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

  console.log(`OK: ${tarGzPath}`);
}

main()
  .then(() => {
    // Sur certains runners (Windows), un socket https peut garder l'event loop en vie.
    // On force une sortie propre pour éviter de bloquer le workflow.
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

