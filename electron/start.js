const { spawn } = require("child_process");
const path = require("path");

// Dans Node, `require("electron")` renvoie le chemin vers l'exécutable Electron.
const electronPath = require("electron");

const mainPath = path.join(__dirname, "main.js");

const env = { ...process.env };
// S'assure qu'on ne lance pas Electron en mode "run as node".
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [mainPath], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => process.exit(code ?? 0));

