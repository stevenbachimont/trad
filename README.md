# Traduction vocale en direct (HTML/JS)

Petit outil local: tu parles dans le micro, le navigateur fait la reconnaissance vocale, puis on traduit via Google Translate.

## Pré-requis

- Un navigateur avec **Web Speech API** (souvent **Chrome desktop**).
- Autoriser l’accès au **micro**.

## Lancer (mode navigateur)

```bash
cd /Users/stevenbachimont/Desktop/trad
python3 -m http.server 5173
```

Puis ouvre `http://localhost:5173`.

## Lancer (mode app desktop frameless – Electron)

```bash
cd /Users/stevenbachimont/Desktop/trad
npm install
npm run model:all
npm start
```

## Traduction via GPT / Gemini (optionnel)

Par défaut, l’app utilise **Google Translate** (sans clé).

Pour activer **GPT (OpenAI)** ou **Gemini**, définis des variables d’environnement avant `npm start`:

- **OpenAI**: `OPENAI_API_KEY` (optionnel: `OPENAI_MODEL`, ex `gpt-4o-mini`)
- **Gemini**: `GOOGLE_API_KEY` (optionnel: `GEMINI_MODEL`, ex `gemini-1.5-flash`)

## Traduction 100% locale (souveraine) via Ollama (recommandé pour laptops 16GB)

1. Installer Ollama:

- macOS: via l’installeur sur `https://ollama.com`
- Windows: via l’installeur sur `https://ollama.com`

1. Télécharger un modèle “léger” (exemple):

```bash
ollama pull qwen2.5:3b
```

Optionnel: définir `OLLAMA_MODEL` si tu veux un autre modèle.

1. Dans l’app, choisir **Modèle de traduction → Local (Ollama)**.

## Traduction 100% locale (sans Ollama) – téléchargement au 1er lancement (Option C)

Dans l’app, choisir **Modèle de traduction → Local (intégré)**.

Au premier usage, l’app télécharge automatiquement:

- `llama.cpp` (binaire `llama-server` pour macOS/Windows)
- un modèle GGUF de traduction (par défaut MADLAD400-3B-MT Q4_K_M, ~1.9GB)

Variables d’environnement optionnelles:

- `LOCAL_TRANSLATE_GGUF_URL`: URL directe du fichier `.gguf`
- `LOCAL_TRANSLATE_GGUF_FILE`: nom de fichier local (ex: `model.gguf`)
- `LOCAL_TRANSLATE_CTX`: contexte (ex: `2048`)

## Build installateurs (DMG macOS / EXE Windows)

### macOS (DMG)

```bash
cd /Users/stevenbachimont/Desktop/trad
npm install
npm run dist:mac
```

Le DMG est généré dans `dist/` (ex: `Trad Live-1.0.0-arm64.dmg`).

### Windows (.exe – NSIS)

Sur Windows, dans un terminal:

```bash
npm install
npm run dist:win
```

L’installateur `.exe` est généré dans `dist/`.

## Notes / limites

- Le menu “Source audio (micro)” liste les micros disponibles, mais **la dictée intégrée du navigateur n’accepte pas toujours un micro spécifique**. Si besoin, change le micro via les permissions du site / paramètres du navigateur.
- La traduction utilise l’endpoint public `translate.googleapis.com`. Si ton réseau ou ton navigateur bloque la requête (CORS), il faudra passer par un petit proxy (Node/Express) ou une API officielle avec clé.
- En mode Electron, la fenêtre secondaire est **frameless** (sans bordure) et peut être rendue **transparente** + fond personnalisable depuis la fenêtre principale.
- En mode Electron, la dictée utilise **Vosk (offline)** via `vosk-browser`. Le modèle FR est téléchargé par `npm run model:fr` (≈ 40–50MB).
- En mode Electron, la dictée utilise **Vosk (offline)** via `vosk-browser`. Tu peux télécharger :
  - les modèles “habituels” : `npm run model:all` (FR/EN/ES/DE/IT)
  - un seul modèle : `npm run model:en` (ou `fr`, `es`, `de`, `it`)
