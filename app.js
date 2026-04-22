/* global SpeechRecognition, webkitSpeechRecognition, Vosk */

const $ = (id) => document.getElementById(id);

const micSelect = $("mic");
const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const sttLangSelect = $("sttLang");
const sttQualitySelect = $("sttQuality");
const sttGrammarWrap = $("sttGrammarWrap");
const sttGrammarInput = $("sttGrammar");
const pptxFileInput = $("pptxFile");
const pptxExtractBtn = $("pptxExtract");
const pptxAppendCheck = $("pptxAppend");
const startBtn = $("start");
const stopBtn = $("stop");
const clearBtn = $("clear");
const popupBtn = $("popup");
const popupFontRange = $("popupFont");
const popupBiggerBtn = $("popupBigger");
const popupSmallerBtn = $("popupSmaller");
const popupBgInput = $("popupBg");
const popupOpacityRange = $("popupOpacity");
const popupOpacityLabel = $("popupOpacityLabel");
const popupNoFrameCheck = $("popupNoFrame");
const popupAlwaysOnTopCheck = $("popupAlwaysOnTop");
const popupResizableCheck = $("popupResizable");
const popupFontFamilySelect = $("popupFontFamily");
const popupFontBoldCheck = $("popupFontBold");
const translateProviderSelect = $("translateProvider");
const statusEl = $("status");
const statusTextEl = $("statusText");
const modelProgressEl = $("modelProgress");

const helpBtn = $("helpBtn");
const helpModal = $("helpModal");
const helpCloseBtn = $("helpClose");

const onboardingModal = $("onboardingModal");
const onboardingCloseBtn = $("onboardingClose");
const onboardingOkBtn = $("onboardingOk");
const onboardingDontShowCheck = $("onboardingDontShow");

const spokenPresetBtns = [
  $("spokenPresetBtn1"),
  $("spokenPresetBtn2"),
  $("spokenPresetBtn3"),
  $("spokenPresetBtn4"),
];
const spokenPresetSels = [
  $("spokenPresetSel1"),
  $("spokenPresetSel2"),
  $("spokenPresetSel3"),
  $("spokenPresetSel4"),
];
const targetPresetBtns = [
  $("targetPresetBtn1"),
  $("targetPresetBtn2"),
  $("targetPresetBtn3"),
  $("targetPresetBtn4"),
];
const targetPresetSels = [
  $("targetPresetSel1"),
  $("targetPresetSel2"),
  $("targetPresetSel3"),
  $("targetPresetSel4"),
];

const recStateEl = $("recState");
const confidenceEl = $("confidence");
const finalTextEl = $("finalText");
const interimTextEl = $("interimText");
const translatedTextEl = $("translatedText");
const translateStateEl = $("translateState");
const micMeterEl = $("micMeter");

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const HAS_VOSK = typeof window.Vosk !== "undefined";

const PROVIDERS = /** @type {const} */ ({
  google: "google",
  local: "local",
  openai: "openai",
  gemini: "gemini",
});

let translateProvider = PROVIDERS.google;

const LANGS = [
  { code: "auto", label: "Auto (détecter)" },
  { code: "fr-FR", label: "Français" },
  { code: "en-US", label: "Anglais (US)" },
  { code: "en-GB", label: "Anglais (UK)" },
  { code: "es-ES", label: "Espagnol" },
  { code: "de-DE", label: "Allemand" },
  { code: "it-IT", label: "Italien" },
  { code: "pt-PT", label: "Portugais" },
  { code: "pt-BR", label: "Portugais (Brésil)" },
  { code: "nl-NL", label: "Néerlandais" },
  { code: "pl-PL", label: "Polonais" },
  { code: "tr-TR", label: "Turc" },
  { code: "ru-RU", label: "Russe" },
  { code: "uk-UA", label: "Ukrainien" },
  { code: "ar", label: "Arabe" },
  { code: "hi", label: "Hindi" },
  { code: "ja-JP", label: "Japonais" },
  { code: "ko-KR", label: "Coréen" },
  { code: "zh-CN", label: "Chinois (simplifié)" },
  { code: "zh-TW", label: "Chinois (traditionnel)" },
];

// Google Translate endpoint accepte plutôt des codes "fr", "en", "es"…
function toTranslateCode(bcp47) {
  if (!bcp47) return "auto";
  const lower = String(bcp47).toLowerCase();
  if (lower === "auto") return "auto";
  // "fr-FR" -> "fr"
  return lower.split("-")[0];
}

function setStatus(text, kind = "info") {
  if (statusTextEl) statusTextEl.textContent = text;
  else statusEl.textContent = text;
  statusEl.style.borderColor =
    kind === "danger"
      ? "rgba(255,92,117,.55)"
      : kind === "good"
        ? "rgba(46,229,157,.45)"
        : "rgba(255,255,255,.10)";
}

function setModelProgress(pctOrNull) {
  if (!modelProgressEl) return;
  if (pctOrNull == null) {
    modelProgressEl.hidden = true;
    modelProgressEl.value = 0;
    return;
  }
  modelProgressEl.hidden = false;
  if (pctOrNull === "indeterminate") {
    // <progress> indeterminate = pas d'attribut value.
    try {
      modelProgressEl.removeAttribute("value");
    } catch {}
    return;
  }
  const v = Math.max(0, Math.min(100, Number(pctOrNull)));
  modelProgressEl.value = v;
}

function openHelp() {
  if (!helpModal) return;
  helpModal.classList.add("open");
  helpModal.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  if (!helpModal) return;
  helpModal.classList.remove("open");
  helpModal.setAttribute("aria-hidden", "true");
}

function openOnboarding() {
  if (!onboardingModal) return;
  onboardingModal.classList.add("open");
  onboardingModal.setAttribute("aria-hidden", "false");
}

function closeOnboarding() {
  if (!onboardingModal) return;
  onboardingModal.classList.remove("open");
  onboardingModal.setAttribute("aria-hidden", "true");
}

function fillLangSelect(select, defaultCode) {
  select.innerHTML = "";
  for (const l of LANGS) {
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.label;
    select.appendChild(opt);
  }
  select.value = defaultCode;
}

function fillLangSelectFiltered(select, codes, defaultCode) {
  select.innerHTML = "";
  for (const l of LANGS) {
    if (!codes.has(l.code)) continue;
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.label;
    select.appendChild(opt);
  }
  select.value = defaultCode;
}

function labelForLang(code) {
  const c = String(code || "");
  // Affichage court pour boutons (FR, EN, ES…)
  const base = c.split("-")[0].toUpperCase();
  if (base.length >= 2 && base.length <= 3) return base;
  const found = LANGS.find((l) => l.code === code);
  return found ? found.label : c;
}

function setSelectValueAndNotify(select, value) {
  if (!select) return;
  // Si on pilote le modèle STT, on mappe "fr-FR" -> "fr"
  if (select.id === "sttLang") {
    const base = String(value || "").split("-")[0].toLowerCase();
    if (base) select.value = base;
    else select.value = value;
  } else {
    select.value = value;
  }
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function initLangPresets({
  storagePrefix,
  buttons,
  selects,
  mainSelect,
  defaultCodes,
  allowAuto,
}) {
  const allowed = new Set(
    LANGS.map((l) => l.code).filter((c) => (allowAuto ? true : c !== "auto")),
  );

  for (let i = 0; i < 4; i++) {
    const btn = buttons[i];
    const sel = selects[i];
    if (!btn || !sel) continue;

    let saved = null;
    try {
      saved = localStorage.getItem(`${storagePrefix}${i + 1}`);
    } catch {}
    const code = allowed.has(saved) ? saved : defaultCodes[i];

    fillLangSelectFiltered(sel, allowed, code);
    btn.textContent = labelForLang(sel.value);

    sel.addEventListener("change", () => {
      btn.textContent = labelForLang(sel.value);
      try {
        localStorage.setItem(`${storagePrefix}${i + 1}`, sel.value);
      } catch {}
    });

    btn.addEventListener("click", () => {
      setSelectValueAndNotify(mainSelect, sel.value);
    });
  }
}

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

function safeJoinFinalText() {
  return finalTextEl.textContent.trim();
}

async function translate(text) {
  const sl = toTranslateCode(sourceLang.value);
  const tl = toTranslateCode(targetLang.value);

  if (!text) {
    translatedTextEl.textContent = "";
    translateStateEl.textContent = "—";
    postToPopup(getPopupPayload());
    return;
  }

  translateStateEl.textContent = "traduction…";
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      "?client=gtx" +
      `&sl=${encodeURIComponent(sl)}` +
      `&tl=${encodeURIComponent(tl)}` +
      "&dt=t" +
      `&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // data[0] = [[translated, original, ...], ...]
    const translated = Array.isArray(data?.[0])
      ? data[0].map((chunk) => chunk?.[0]).filter(Boolean).join("")
      : "";

    translatedTextEl.textContent = translated || "";

    const detected = data?.[2]; // parfois la langue détectée
    translateStateEl.textContent =
      sl === "auto" && typeof detected === "string"
        ? `ok (détecté: ${detected})`
        : "ok";
    postToPopup(getPopupPayload({ detectedLang: detected }));
  } catch (err) {
    translateStateEl.textContent = "erreur";
    postToPopup(getPopupPayload());
    setStatus(
      "Traduction impossible (réseau/CORS). Essaie un autre navigateur ou une version avec petit serveur proxy.",
      "danger",
    );
  }
}

async function translateChunk(text, { signal } = {}) {
  const sl = toTranslateCode(sourceLang.value);
  const tl = toTranslateCode(targetLang.value);
  const q = String(text || "").trim();
  if (!q) return { translated: "", detected: null };

  // Providers via Electron main process (clé API côté main, pas dans l'UI)
  if (translateProvider !== PROVIDERS.google) {
    if (!window.tradDesktop?.translateChunk) {
      throw new Error("provider_requires_electron");
    }
    const out = await window.tradDesktop.translateChunk({
      provider: translateProvider,
      sl,
      tl,
      text: q,
    });
    return {
      translated: out?.translated || "",
      detected: out?.detected ?? null,
    };
  }

  const url =
    "https://translate.googleapis.com/translate_a/single" +
    "?client=gtx" +
    `&sl=${encodeURIComponent(sl)}` +
    `&tl=${encodeURIComponent(tl)}` +
    "&dt=t" +
    `&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const translated = Array.isArray(data?.[0])
    ? data[0].map((chunk) => chunk?.[0]).filter(Boolean).join("")
    : "";
  const detected = data?.[2] ?? null;

  return { translated: translated || "", detected };
}

const translateDebounced = debounce(() => translate(safeJoinFinalText()), 350);
const translateInterimDebounced = debounce((t) => translateInterim(t), 160);

let translatedFinalAcc = "";
let interimAbort = null;
let popupFontSize = 28;
let popupBg = "#2b2b2b";
let popupBgOpacity = 0.7;
let popupNoFrame = false;
let popupAlwaysOnTop = true;
let popupResizable = true;
let popupFontFamily = "system";
let popupFontBold = false;
let interimTranslatedLast = "";
let recentFinalPieces = [];
const RECENT_FINAL_MAX = 12;
let recentFinalTranslations = [];
const RECENT_TRANSL_MAX = 12;
let revealTimer = null;
let revealQueue = [];
let revealTargetLine = "";
let revealCancelled = 0;

function normalizeLine(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function stopReveal() {
  revealCancelled++;
  revealQueue = [];
  revealTargetLine = "";
  if (revealTimer) {
    window.clearTimeout(revealTimer);
    revealTimer = null;
  }
}

function startRevealTranslatedLine(line, { wordsPerTick = 3, tickMs = 120 } = {}) {
  const clean = normalizeLine(line);
  if (!clean) return;

  // On stoppe l'animation précédente (sinon chevauchements / doublons visuels).
  stopReveal();

  const words = clean.split(" ").filter(Boolean);
  revealQueue = words.slice();
  revealTargetLine = "";
  const myToken = revealCancelled;

  const base = translatedFinalAcc.trim();
  const baseWithSep = base ? base + "\n" : "";

  const tick = () => {
    if (myToken !== revealCancelled) return;
    const take = revealQueue.splice(0, wordsPerTick);
    if (take.length) {
      revealTargetLine = [revealTargetLine, take.join(" ")].filter(Boolean).join(" ");
      translatedTextEl.textContent = baseWithSep + revealTargetLine;
      postToPopup(getPopupPayload());
    }
    if (revealQueue.length) {
      revealTimer = window.setTimeout(tick, tickMs);
    } else {
      // Commit final
      translatedFinalAcc = (baseWithSep + clean).trim();
      interimTranslatedLast = "";
      updateTranslatedDisplay("");
      revealTimer = null;
    }
  };

  tick();
}

function shouldAcceptFinalPiece(piece) {
  const clean = String(piece || "").trim();
  if (!clean) return false;
  // Normalisation simple pour réduire les doublons causés par espaces multiples
  const norm = clean.replace(/\s+/g, " ");
  if (recentFinalPieces.includes(norm)) return false;
  recentFinalPieces.push(norm);
  if (recentFinalPieces.length > RECENT_FINAL_MAX) {
    recentFinalPieces = recentFinalPieces.slice(-RECENT_FINAL_MAX);
  }
  return true;
}

function updateTranslatedDisplay(interimTranslated = "") {
  interimTranslatedLast = String(interimTranslated || "");
  const full = [translatedFinalAcc.trim(), String(interimTranslated || "").trim()]
    .filter(Boolean)
    .join("\n");
  translatedTextEl.textContent = full;
  postToPopup(getPopupPayload());
}

async function translateFinalPiece(piece) {
  const clean = String(piece || "").trim();
  if (!clean) return;
  if (!shouldAcceptFinalPiece(clean)) return;

  // Affichage immédiat "optimiste" : on montre l'état sans bloquer l'UI.
  translateStateEl.textContent = "traduction…";
  postToPopup(getPopupPayload());

  try {
    const { translated, detected } = await translateChunk(clean);
    if (translated) {
      const translatedLine = normalizeLine(translated);
      const lastTranslated = normalizeLine(recentFinalTranslations[recentFinalTranslations.length - 1]);
      if (translatedLine && translatedLine !== lastTranslated) {
        recentFinalTranslations.push(translatedLine);
        if (recentFinalTranslations.length > RECENT_TRANSL_MAX) {
          recentFinalTranslations = recentFinalTranslations.slice(-RECENT_TRANSL_MAX);
        }
        // Affichage fluide: on "révèle" la traduction finale par petits groupes de mots
        startRevealTranslatedLine(translatedLine, { wordsPerTick: 3, tickMs: 110 });
      }
      // Quand un morceau passe en final, on évite d'afficher l'intermédiaire (sinon doublon visuel).
      interimTranslatedLast = "";
      // (le commit final est fait à la fin du reveal)
    }

    translateStateEl.textContent =
      toTranslateCode(sourceLang.value) === "auto" && typeof detected === "string"
        ? `ok (détecté: ${detected})`
        : "ok";
    postToPopup(getPopupPayload({ detectedLang: detected }));
  } catch (err) {
    translateStateEl.textContent = "erreur";
    postToPopup(getPopupPayload());
  }
}

async function translateInterim(interimText) {
  const clean = String(interimText || "").trim();
  if (!clean) {
    updateTranslatedDisplay("");
    return;
  }

  if (interimAbort) interimAbort.abort();
  interimAbort = new AbortController();

  translateStateEl.textContent = "traduction…";
  postToPopup(getPopupPayload());

  try {
    const { translated, detected } = await translateChunk(clean, {
      signal: interimAbort.signal,
    });
    updateTranslatedDisplay(translated);
    translateStateEl.textContent =
      toTranslateCode(sourceLang.value) === "auto" && typeof detected === "string"
        ? `ok (détecté: ${detected})`
        : "ok";
    postToPopup(getPopupPayload({ detectedLang: detected }));
  } catch (err) {
    if (err?.name === "AbortError") return;
    translateStateEl.textContent = "erreur";
    postToPopup(getPopupPayload());
  }
}

let recognition = null;
let isRunning = false;
let lastConfidence = null;
let popupWin = null;
let popupBc = null;
let popupDesktopOpen = false;
let listenRequested = false;
let micStream = null;
let audioCtx = null;
let analyser = null;
let meterRaf = null;

// Vosk (WASM) STT (Electron-friendly)
let voskModel = null;
let voskRecognizer = null;
let sttStream = null;
let sttAudioCtx = null;
let sttProcessor = null;
let sttSource = null;
let usingVosk = false;

const VOSK_TARGET_SAMPLE_RATE = 16000;
const VOSK_VAD_RMS_THRESHOLD = 0.008; // ~ -42dBFS (à ajuster selon micro)
const VOSK_VAD_HANGOVER_FRAMES = 12; // ~ 12 * 4096/48k ≈ 1s max (selon SR)

let sttLang = "fr";
let sttModelVariant = "small"; // small | lgraph | big
let sttUseGrammar = false;
let sttQuality = "fast"; // fast | balanced | anti
const VOSK_INIT_TIMEOUT_MS = 120_000;

function normalizeTerm(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextRunsFromPptxXml(xml) {
  // PowerPoint text runs are typically in <a:t>...</a:t>
  // Regex sur XML est fragile → on préfère un parse XML.
  const src = String(xml || "");
  try {
    const doc = new DOMParser().parseFromString(src, "application/xml");
    const nodes = doc.getElementsByTagName("a:t");
    const out = [];
    for (const n of nodes) {
      const v = n?.textContent ?? "";
      if (v) out.push(v);
    }
    return out.join(" ");
  } catch {
    // Fallback: regex si DOMParser échoue (environnements bizarres)
    const out = [];
    const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let m = null;
    while ((m = re.exec(src)) != null) {
      const raw = m[1] || "";
      const decoded = raw
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'");
      out.push(decoded);
    }
    return out.join(" ");
  }
}

function buildGrammarFromConferenceText(text, { maxLines = 700 } = {}) {
  const t = normalizeTerm(text);
  if (!t) return [];

  const shouldRejectToken = (w) => {
    const s = String(w || "").trim();
    if (!s) return true;
    // Évite que du XML/attributs polluent la liste (vu dans certains decks)
    if (s.includes("<") || s.includes(">")) return true;
    if (s.includes("xmlns") || s.includes("schemas.microsoft.com")) return true;
    if (/^[ap]\:/.test(s)) return true; // a:..., p:...
    if (s.includes('="') || s.includes("='")) return true;
    if (s.includes("}{") || s.includes("{") || s.includes("}")) return true;
    // Trop numérique → bruit (coordonnées, tailles, ids…)
    if (/^\d+$/.test(s)) return true;
    if (/^\d{1,2}([./-]\d{1,2}){1,2}$/.test(s)) return false; // dates courtes OK
    // Séquences du style 480104 / 1257590 : on les ignore
    if (/^\d{5,}$/.test(s)) return true;
    // Unités/valeurs style 0.22 / 1.5G : on ignore
    if (/^\d+(\.\d+)?[kKmMgG]?$/.test(s)) return true;
    return false;
  };

  // Tokenize: keep words with letters/digits and some connectors
  const tokens = t
    .split(/[\s/|]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);

  const freq = new Map();
  const bump = (s, w = 1) => {
    const key = normalizeTerm(s);
    if (!key) return;
    freq.set(key, (freq.get(key) || 0) + w);
  };

  // Single terms
  for (const tok of tokens) {
    const clean = tok.replace(/[“”‘’]/g, "'").trim();
    if (!clean || shouldRejectToken(clean)) continue;
    const isAcronym = /^[A-Z0-9]{2,}$/.test(clean);
    const isCamel = /[a-z][A-Z]/.test(clean);
    const isLong = clean.length >= 7;
    const hasDigit = /\d/.test(clean);
    const looksLikeTerm = isAcronym || isCamel || isLong || hasDigit;
    if (!looksLikeTerm) continue;
    bump(clean, isAcronym ? 5 : isCamel ? 3 : 1);
  }

  // Short phrases (bigrams/trigrams) favoring TitleCase / acronyms
  const normTokens = tokens.map((x) => x.trim()).filter(Boolean);
  const isTitleish = (w) => /^[A-ZÀ-Ý][\p{L}\p{N}'’\-]{2,}$/u.test(w) || /^[A-Z0-9]{2,}$/.test(w);
  for (let i = 0; i < normTokens.length; i++) {
    const a = normTokens[i];
    const b = normTokens[i + 1];
    const c = normTokens[i + 2];
    if (a && b && isTitleish(a) && isTitleish(b) && !shouldRejectToken(a) && !shouldRejectToken(b))
      bump(`${a} ${b}`, 2);
    if (
      a &&
      b &&
      c &&
      isTitleish(a) &&
      isTitleish(b) &&
      isTitleish(c) &&
      !shouldRejectToken(a) &&
      !shouldRejectToken(b) &&
      !shouldRejectToken(c)
    )
      bump(`${a} ${b} ${c}`, 3);
  }

  // Sort by score then length (prefer shorter), then alpha
  const lines = Array.from(freq.entries())
    .sort((x, y) => {
      if (y[1] !== x[1]) return y[1] - x[1];
      if (x[0].length !== y[0].length) return x[0].length - y[0].length;
      return x[0].localeCompare(y[0]);
    })
    .map(([k]) => k);

  return lines.slice(0, maxLines);
}

async function extractGrammarFromPptxFile(file) {
  if (!file) throw new Error("pptx_missing");
  if (!/\.pptx$/i.test(file.name || "")) throw new Error("pptx_not_supported");
  if (typeof window.JSZip === "undefined") throw new Error("jszip_missing");

  const buf = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(buf);

  // Slides + notes (souvent utiles)
  const slideFiles = Object.keys(zip.files).filter(
    (p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(p),
  );
  if (slideFiles.length === 0) throw new Error("pptx_no_slides");

  let combined = "";
  for (const p of slideFiles) {
    const xml = await zip.file(p).async("string");
    combined += "\n" + extractTextRunsFromPptxXml(xml);
  }
  return buildGrammarFromConferenceText(combined, { maxLines: 700 });
}

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function withFetchProgress(targetUrl, onProgress, fn) {
  const originalFetch = window.fetch.bind(window);
  const target = String(targetUrl);

  window.fetch = async (...args) => {
    const req = args[0];
    const url = typeof req === "string" ? req : req?.url;
    const res = await originalFetch(...args);

    if (!url || String(url) !== target) return res;
    if (!res.ok) return res;
    if (!res.body || typeof res.body.getReader !== "function") return res;

    const total = Number(res.headers.get("content-length") || "0") || 0;
    const reader = res.body.getReader();
    let received = 0;
    let lastUiAt = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          onProgress?.(100, received, total);
          controller.close();
          return;
        }
        received += value?.byteLength || 0;
        const now = Date.now();
        if (now - lastUiAt > 120) {
          lastUiAt = now;
          const pct = total ? (received / total) * 100 : null;
          onProgress?.(pct, received, total);
        }
        controller.enqueue(value);
      },
      cancel(reason) {
        try {
          reader.cancel(reason);
        } catch {}
      },
    });

    // On reconstitue une Response consommable par le code Vosk,
    // tout en comptant les octets pour la progression.
    return new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  try {
    return await fn();
  } finally {
    window.fetch = originalFetch;
  }
}

function getVoskModelUrl() {
  const lang = encodeURIComponent(sttLang);
  const variant = encodeURIComponent(sttModelVariant);
  return `./models/${lang}/${variant}/model.tar.gz`;
}

const STT_TO_BCP47 = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
};

async function ensureVoskModel() {
  if (!HAS_VOSK) throw new Error("vosk_not_loaded");
  if (voskModel) return voskModel;
  setStatus("Chargement du modèle Vosk…", "info");
  setModelProgress(0);
  // Nouveau chemin (avec taille) + fallback compat (ancien chemin sans taille).
  const preferred = getVoskModelUrl();
  const legacy = `./models/${encodeURIComponent(sttLang)}/model.tar.gz`;
  const url = (await urlExists(preferred)) ? preferred : legacy;

  // IMPORTANT: on laisse Vosk faire son propre fetch/extract,
  // mais on wrap fetch() pour afficher la progression sans double download.
  if (sttModelVariant === "big") {
    setStatus(
      "Modèle Vosk “big” : initialisation très longue (et parfois impossible en WASM). Patiente, ou repasse en “small” si ça n’aboutit pas.",
      "info",
    );
  }
  setStatus("Téléchargement modèle Vosk…", "info");
  await withFetchProgress(
    url,
    (pct, received, total) => {
      if (pct == null) {
        setStatus(
          `Téléchargement modèle Vosk… ${(received / (1024 * 1024)).toFixed(0)} MB`,
          "info",
        );
        setModelProgress("indeterminate");
        return;
      }
      setStatus(
        total
          ? `Téléchargement modèle Vosk… ${pct.toFixed(1)}% (${(
              received /
              (1024 * 1024)
            ).toFixed(0)}/${(total / (1024 * 1024)).toFixed(0)} MB)`
          : `Téléchargement modèle Vosk… ${pct.toFixed(1)}%`,
        "info",
      );
      setModelProgress(pct);
    },
    async () => {
      setStatus("Initialisation Vosk…", "info");
      const initPromise = window.Vosk.createModel(url);
      const timeoutPromise = new Promise((_, reject) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          reject(new Error("vosk_init_timeout"));
        }, VOSK_INIT_TIMEOUT_MS);
      });
      voskModel = await Promise.race([initPromise, timeoutPromise]);
    },
  );

  setModelProgress(null);
  return voskModel;
}

function stopVosk() {
  usingVosk = false;
  listenRequested = false;

  try {
    voskRecognizer?.retrieveFinalResult?.();
  } catch {}

  try {
    if (sttSource) sttSource.disconnect();
  } catch {}
  try {
    if (sttProcessor) sttProcessor.disconnect();
  } catch {}
  sttSource = null;
  sttProcessor = null;

  if (sttAudioCtx) {
    try {
      sttAudioCtx.close();
    } catch {}
    sttAudioCtx = null;
  }
  if (sttStream) {
    try {
      sttStream.getTracks().forEach((t) => t.stop());
    } catch {}
    sttStream = null;
  }

  try {
    voskRecognizer?.remove?.();
  } catch {}
  voskRecognizer = null;
  voskModel = null;

  setMicMeter(0);
  setRunning(false);
}

async function startVosk() {
  if (!HAS_VOSK) {
    setStatus("Vosk n’est pas chargé (script manquant).", "danger");
    return;
  }
  if (usingVosk) return;
  listenRequested = true;

  try {
    const model = await ensureVoskModel();
    // Ouvre le micro + audio context d'abord pour obtenir un sampleRate fiable
    // (KaldiRecognizer attend un sampleRate en argument).

    // Ouvre le micro avec contraintes favorables STT (mono, 16k si possible)
    const constraints = {
      audio: {
        deviceId: micSelect?.value && !micSelect.disabled ? { ideal: micSelect.value } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 16000,
      },
      video: false,
    };

    sttStream = await navigator.mediaDevices.getUserMedia(constraints);
    // Essaye de forcer 16kHz (réduit les erreurs / “hallucinations” sur les modèles Vosk).
    // Certains environnements ignorent cette valeur (hardware clock), on downsample alors.
    sttAudioCtx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: VOSK_TARGET_SAMPLE_RATE,
      latencyHint: "interactive",
    });
    try {
      await sttAudioCtx.resume();
    } catch {}

    voskRecognizer = new model.KaldiRecognizer(VOSK_TARGET_SAMPLE_RATE);
    // Si l’API le supporte, active le retour détaillé (permet filtrage/diagnostic).
    try {
      voskRecognizer?.setWords?.(true);
    } catch {}
    try {
      voskRecognizer?.setPartialWords?.(true);
    } catch {}

    // Grammaire (anti-hallucination): limite les phrases possibles.
    if (sttUseGrammar) {
      const raw = String(sttGrammarInput?.value || "");
      const lines = raw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const unique = Array.from(new Set(lines)).slice(0, 2000);
      if (unique.length === 0) {
        setStatus(
          "Mode anti-hallucination: ajoute au moins 1 phrase attendue (sinon la grammaire est ignorée).",
          "danger",
        );
      } else {
        try {
          // API vosk-browser: setGrammar([...phrases])
          voskRecognizer?.setGrammar?.(unique);
          setStatus(`Grammaire active (${unique.length} phrases).`, "info");
        } catch {
          setStatus(
            "Grammaire indisponible avec ce build Vosk. (On continue en dictée libre.)",
            "danger",
          );
        }
      }
    }
    let sawAnyResult = false;
    const noResultTimer = setTimeout(() => {
      if (!listenRequested || sawAnyResult) return;
      setStatus(
        "Vosk écoute mais ne renvoie aucun texte. Vérifie le modèle et parle plus près du micro.",
        "danger",
      );
    }, 5000);

    voskRecognizer.on("partialresult", (msg) => {
      sawAnyResult = true;
      if (!listenRequested) return;
      const partial = msg?.result?.partial ? String(msg.result.partial) : "";
      interimTextEl.textContent = partial.trim();
      postToPopup(getPopupPayload());
      if (partial.trim()) translateInterimDebounced(partial.trim());
    });

    voskRecognizer.on("result", (msg) => {
      sawAnyResult = true;
      if (!listenRequested) return;
      const text = msg?.result?.text ? String(msg.result.text) : "";
      const clean = text.trim();
      if (!clean) return;
      if (!shouldAcceptFinalPiece(clean)) return;

      const existing = finalTextEl.textContent;
      const sep = existing && !existing.endsWith("\n") ? "\n" : "";
      finalTextEl.textContent = existing + sep + clean;
      interimTextEl.textContent = "";
      postToPopup(getPopupPayload());
      translateFinalPiece(clean);
    });

    sttSource = sttAudioCtx.createMediaStreamSource(sttStream);
    sttProcessor = sttAudioCtx.createScriptProcessor(4096, 1, 1);

    let vadHangover = 0;

    function downsampleFloat32ToTarget(input, inSampleRate) {
      const outSampleRate = VOSK_TARGET_SAMPLE_RATE;
      if (!input || !input.length) return input;
      if (!inSampleRate || inSampleRate === outSampleRate) return input;

      const ratio = inSampleRate / outSampleRate;
      const outLength = Math.max(1, Math.floor(input.length / ratio));
      const out = new Float32Array(outLength);

      // Moyennage simple (box filter) pour éviter un aliasing trop violent.
      let offset = 0;
      for (let i = 0; i < outLength; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        let count = 0;
        for (let j = start; j < end; j++) {
          sum += input[j];
          count++;
        }
        out[offset++] = count ? sum / count : input[start] ?? 0;
      }
      return out;
    }

    sttProcessor.onaudioprocess = (event) => {
      if (!listenRequested || !voskRecognizer) return;

      // Meter (RMS)
      const input = event.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
      const rms = Math.sqrt(sumSq / input.length);
      setMicMeter(Math.min(1, rms * 4));

      // VAD très simple: on ne pousse pas de silence/bruit faible dans le décodeur.
      // Ça réduit fortement les “phrases fantômes” quand personne ne parle.
      const speaking = rms >= VOSK_VAD_RMS_THRESHOLD;
      if (speaking) vadHangover = VOSK_VAD_HANGOVER_FRAMES;
      else vadHangover = Math.max(0, vadHangover - 1);
      if (!speaking && vadHangover === 0) return;

      try {
        const inSr = event.inputBuffer.sampleRate || sttAudioCtx.sampleRate;
        const down = downsampleFloat32ToTarget(input, inSr);
        // Construire un AudioBuffer 16kHz pour coller à KaldiRecognizer(16000).
        const buf = sttAudioCtx.createBuffer(1, down.length, VOSK_TARGET_SAMPLE_RATE);
        buf.copyToChannel(down, 0, 0);
        voskRecognizer.acceptWaveform(buf);
      } catch (e) {
        const msg = String(e?.message || e || "acceptWaveform_failed");
        setStatus(`Vosk: erreur audio (${msg})`, "danger");
      }
    };

    sttSource.connect(sttProcessor);
    sttProcessor.connect(sttAudioCtx.destination);

    usingVosk = true;
    setRunning(true);
    setStatus("Écoute (Vosk)…", "good");

    const cancelIfStopped = () => {
      if (!listenRequested) clearTimeout(noResultTimer);
      else setTimeout(cancelIfStopped, 250);
    };
    cancelIfStopped();
  } catch (e) {
    stopVosk();
    const msg = String(e?.message || e || "unknown");
    if (msg.includes("vosk_init_timeout")) {
      setStatus(
        "Vosk: l’initialisation du modèle a expiré. Le modèle “big” est souvent trop lourd pour `vosk-browser` (WASM). Recommande: repasser en “small” (ou utiliser un moteur STT non-WASM).",
        "danger",
      );
      return;
    }
    if (msg.includes("404") || msg.includes("model")) {
      setStatus(
        "Modèle Vosk introuvable. Télécharge-le dans `./models/fr/model.tar.gz` (voir README).",
        "danger",
      );
    } else {
      setStatus(`Vosk: échec démarrage (${msg})`, "danger");
    }
  }
}

function setMicMeter(level01) {
  if (!micMeterEl) return;
  const clamped = Math.max(0, Math.min(1, level01));
  micMeterEl.style.width = `${Math.round(clamped * 100)}%`;
}

function stopMicMonitor() {
  if (meterRaf) {
    cancelAnimationFrame(meterRaf);
    meterRaf = null;
  }
  analyser = null;
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {
      // ignore
    }
    audioCtx = null;
  }
  if (micStream) {
    try {
      micStream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micStream = null;
  }
  setMicMeter(0);
}

async function startMicMonitor() {
  if (!navigator.mediaDevices?.getUserMedia) return;

  stopMicMonitor();

  const constraints =
    micSelect?.value && !micSelect.disabled
      ? { audio: { deviceId: { ideal: micSelect.value } } }
      : { audio: true };

  micStream = await navigator.mediaDevices.getUserMedia(constraints);
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(micStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);

  const tick = () => {
    if (!analyser) return;
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128; // [-1,1]
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length); // ~0..1
    // Ré-échelle simple pour être plus “lisible”
    const visual = Math.min(1, rms * 4);
    setMicMeter(visual);
    meterRaf = requestAnimationFrame(tick);
  };

  tick();
}

function getPopupPayload(extra = {}) {
  return {
    sourceLabel: sourceLang.options?.[sourceLang.selectedIndex]?.textContent ?? "",
    targetLabel: targetLang.options?.[targetLang.selectedIndex]?.textContent ?? "",
    finalText: finalTextEl.textContent ?? "",
    interimText: interimTextEl.textContent ?? "",
    translatedText: translatedTextEl.textContent ?? "",
    translatedFinalOnly: translatedFinalAcc ?? "",
    translatedLiveOnly: [
      String(translatedFinalAcc || "").trim(),
      String(interimTranslatedLast || "").trim(),
    ]
      .filter(Boolean)
      .join("\n"),
    popupBg,
    popupBgOpacity,
    popupNoFrame,
    popupFontFamily,
    popupFontBold,
    translateState: translateStateEl.textContent ?? "",
    recState: recStateEl.textContent ?? "",
    confidence: confidenceEl.textContent ?? "",
    ...extra,
  };
}

function postToPopup(payload) {
  // Electron (frameless): IPC direct
  if (window.tradDesktop?.popupSendState) {
    try {
      window.tradDesktop.popupSendState({ ...payload, popupFontSize });
    } catch {
      // ignore
    }
    return;
  }

  // BroadcastChannel = voie principale (robuste, même sans window.opener)
  if (!popupBc && "BroadcastChannel" in window) {
    popupBc = new BroadcastChannel("trad_live");
    popupBc.addEventListener("message", (ev) => {
      if (ev?.data?.type !== "hello") return;
      popupBc.postMessage({ type: "state", payload: { ...getPopupPayload(), popupFontSize } });
    });
  }

  if (popupBc) {
    try {
      popupBc.postMessage({ type: "state", payload: { ...payload, popupFontSize } });
    } catch {
      // ignore
    }
  }

  // Fallback postMessage si jamais BroadcastChannel est indisponible.
  if (!popupWin || popupWin.closed) return;
  try {
    popupWin.postMessage(
      { type: "trad:update", payload: { ...payload, popupFontSize } },
      "*",
    );
  } catch {
    // ignore
  }
}

function openOrFocusPopup() {
  // Electron: vraie fenêtre secondaire frameless
  if (window.tradDesktop?.popupOpenOrFocus) {
    window.tradDesktop.popupOpenOrFocus();
    popupDesktopOpen = true;
    // Applique les propriétés natives au moment de l'ouverture
    window.tradDesktop?.popupSetAlwaysOnTop?.(popupAlwaysOnTop);
    window.tradDesktop?.popupSetResizable?.(popupResizable);
    postToPopup(getPopupPayload());
    return;
  }

  if (popupWin && !popupWin.closed) {
    popupWin.focus();
    postToPopup(getPopupPayload());
    return;
  }

  popupWin = window.open(
    "./popup.html",
    "trad_popup",
    "popup=yes,width=420,height=520,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes",
  );

  if (!popupWin) {
    setStatus("Pop-up bloquée. Autorise les pop-ups pour ce site.", "danger");
    return;
  }

  // Envoi différé (au cas où la pop-up charge juste après)
  const payload = getPopupPayload();
  setTimeout(() => postToPopup(payload), 60);
  setTimeout(() => postToPopup(payload), 250);
}

function closePopup() {
  if (window.tradDesktop?.popupClose) {
    window.tradDesktop.popupClose();
    popupDesktopOpen = false;
    return;
  }

  if (!popupWin || popupWin.closed) return;
  try {
    popupWin.close();
  } catch {
    // ignore
  } finally {
    popupWin = null;
  }
}

function setRunning(running) {
  isRunning = running;
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  recStateEl.textContent = running ? "écoute…" : "inactif";
  recStateEl.style.borderColor = running
    ? "rgba(46,229,157,.45)"
    : "rgba(255,255,255,.10)";
  recStateEl.style.color = running ? "rgba(232,238,252,.95)" : "var(--muted)";
  postToPopup(getPopupPayload());
}

function resetText() {
  finalTextEl.textContent = "";
  interimTextEl.textContent = "";
  translatedTextEl.textContent = "";
  confidenceEl.textContent = "";
  translateStateEl.textContent = "—";
  lastConfidence = null;
  translatedFinalAcc = "";
  interimTranslatedLast = "";
  recentFinalPieces = [];
  recentFinalTranslations = [];
  stopReveal();
  if (interimAbort) interimAbort.abort();
  interimAbort = null;
  postToPopup(getPopupPayload());
}

function ensureRecognition() {
  if (!SpeechRec) return null;

  const rec = new SpeechRec();
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  // "auto" n'est pas supporté par la dictée; on met une valeur par défaut.
  // Si l'utilisateur met Auto, on laisse la valeur précédente (souvent mieux que forcer).
  const selected = sourceLang.value;
  if (selected && selected !== "auto") rec.lang = selected;

  rec.onstart = () => {
    setRunning(true);
    setStatus("Écoute en cours…", "good");
  };

  rec.onend = () => {
    setRunning(false);
    // Dans Electron, il arrive que le service s'arrête immédiatement.
    // Si l'utilisateur veut toujours écouter, on tente un redémarrage.
    if (listenRequested) {
      setStatus(
        "Dictée arrêtée par le système — tentative de redémarrage…",
        "info",
      );
      setTimeout(() => {
        if (!listenRequested) return;
        try {
          rec.start();
        } catch {
          // ignore
        }
      }, 250);
    } else {
      setStatus("Arrêté.", "info");
    }
    postToPopup(getPopupPayload());
  };

  rec.onerror = (e) => {
    setRunning(false);
    const msg = e?.error ? String(e.error) : "unknown";
    const hint =
      msg === "not-allowed" || msg === "service-not-allowed"
        ? " (permission micro / service dictée refusé)"
        : msg === "network"
          ? " (service dictée indisponible)"
          : msg === "no-speech"
            ? " (aucune voix détectée)"
            : "";
    setStatus(`Erreur dictée: ${msg}${hint}`, "danger");
    listenRequested = false;
    postToPopup(getPopupPayload({ error: msg }));
  };

  rec.onresult = (event) => {
    let interim = "";
    let finalAppended = false;
    const finalPieces = [];

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alt = result?.[0];
      const transcript = alt?.transcript ?? "";

      if (typeof alt?.confidence === "number") {
        lastConfidence = alt.confidence;
      }

      if (result.isFinal) {
        const existing = finalTextEl.textContent;
        const sep = existing && !existing.endsWith("\n") ? "\n" : "";
        finalTextEl.textContent = existing + sep + transcript.trim();
        finalAppended = true;
        if (transcript.trim()) finalPieces.push(transcript.trim());
      } else {
        interim += transcript;
      }
    }

    interimTextEl.textContent = interim.trim();

    if (typeof lastConfidence === "number") {
      confidenceEl.textContent = `conf: ${(lastConfidence * 100).toFixed(0)}%`;
    }

    postToPopup(getPopupPayload());
    // Traduction "direct" :
    // - chaque morceau final est traduit et ajouté à la suite
    // - l'intermédiaire est traduit en continu (avec annulation si ça change)
    if (finalPieces.length) {
      for (const p of finalPieces) translateFinalPiece(p);
    }
    if (interimTextEl.textContent.trim()) {
      translateInterimDebounced(interimTextEl.textContent.trim());
    } else if (finalAppended) {
      updateTranslatedDisplay("");
    }
  };

  return rec;
}

async function requestMicAndListDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("getUserMedia indisponible dans ce navigateur.", "danger");
    return;
  }

  try {
    // Demande permission micro pour pouvoir afficher les labels.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");

    micSelect.innerHTML = "";
    for (const d of mics) {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Micro (${d.deviceId.slice(0, 6)}…)`;
      micSelect.appendChild(opt);
    }
    micSelect.disabled = mics.length === 0;
    if (mics.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "Aucun micro trouvé";
      micSelect.appendChild(opt);
      micSelect.disabled = true;
    }
  } catch (err) {
    setStatus("Permission micro refusée ou indisponible.", "danger");
    micSelect.disabled = true;
  }
}

async function primeSelectedMic() {
  // Conservé pour compat, mais on ne force plus de "deviceId exact".
  // On utilise désormais un VU mètre (getUserMedia) pour vérifier le bon micro.
  return;
}

function start() {
  // Sur Electron, on préfère Vosk (WASM) car SpeechRecognition est instable/indispo.
  if (window.tradDesktop && HAS_VOSK) {
    startVosk();
    return;
  }

  if (!SpeechRec) {
    setStatus(
      "Reconnaissance vocale indisponible. Utilise Chrome desktop (ou active Web Speech).",
      "danger",
    );
    return;
  }

  if (isRunning) return;
  listenRequested = true;

  startMicMonitor()
    .catch(() => {
      // ignore: la dictée peut quand même marcher
    })
    .finally(() => {
      recognition = ensureRecognition();
      if (!recognition) return;
      try {
        recognition.start();
      } catch (e) {
        setStatus(
          "Impossible de démarrer (peut-être déjà actif). Recharge la page et réessaie.",
          "danger",
        );
        listenRequested = false;
      }
    });
}

function stop() {
  if (usingVosk) {
    stopVosk();
    return;
  }
  if (!recognition) return;
  listenRequested = false;
  try {
    recognition.stop();
  } catch {
    // ignore
  }
  stopMicMonitor();
}

function init() {
  fillLangSelect(sourceLang, "fr-FR");
  fillLangSelect(targetLang, "en-US");

  // STT (Vosk) language
  try {
    const savedStt = localStorage.getItem("trad:sttLang");
    if (savedStt && ["fr", "en", "es", "de", "it"].includes(savedStt)) sttLang = savedStt;
  } catch {}
  if (sttLangSelect) sttLangSelect.value = sttLang;

  // STT quality + grammar
  try {
    const savedQuality = localStorage.getItem("trad:sttQuality");
    if (savedQuality && ["fast", "balanced", "anti"].includes(savedQuality)) sttQuality = savedQuality;
    const savedGrammar = localStorage.getItem("trad:sttGrammar");
    if (typeof savedGrammar === "string" && sttGrammarInput) sttGrammarInput.value = savedGrammar;
  } catch {}

  function applySttQuality(nextQuality) {
    const q = ["fast", "balanced", "anti"].includes(nextQuality) ? nextQuality : "fast";
    sttQuality = q;

    // Map qualité -> variante + grammaire
    if (sttLang === "en") {
      if (q === "anti") {
        sttModelVariant = "lgraph";
        sttUseGrammar = true;
      } else {
        sttModelVariant = "small";
        sttUseGrammar = false;
      }
    } else if (sttLang === "fr") {
      if (q === "anti") {
        sttModelVariant = "small";
        sttUseGrammar = true;
      } else {
        sttModelVariant = "small";
        sttUseGrammar = false;
      }
    } else {
      // ES/DE/IT: keep simple small (WASM-friendly)
      sttModelVariant = "small";
      sttUseGrammar = q === "anti";
    }

    if (sttGrammarWrap) sttGrammarWrap.hidden = !sttUseGrammar;

    try {
      localStorage.setItem("trad:sttQuality", sttQuality);
    } catch {}
  }

  function refreshSttQualityOptions() {
    if (!sttQualitySelect) return;
    sttQualitySelect.innerHTML = "";

    const add = (value, label) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      sttQualitySelect.appendChild(opt);
    };

    if (sttLang === "fr") {
      add("fast", "small (rapide)");
      add("anti", "small + vocabulaire (précis)");
    } else if (sttLang === "en") {
      add("fast", "small (rapide)");
      add("anti", "small + vocabulaire (précis)");
    } else {
      add("fast", "small (rapide)");
      add("anti", "small + vocabulaire (précis)");
    }

    // Si la qualité actuelle n'existe pas pour cette langue, on retombe sur "fast".
    const values = Array.from(sttQualitySelect.options).map((o) => o.value);
    if (!values.includes(sttQuality)) sttQuality = "fast";
    sttQualitySelect.value = sttQuality;
    applySttQuality(sttQuality);
  }

  refreshSttQualityOptions();

  sttLangSelect?.addEventListener("change", () => {
    const next = sttLangSelect.value;
    if (!["fr", "en", "es", "de", "it"].includes(next)) return;
    sttLang = next;
    try {
      localStorage.setItem("trad:sttLang", sttLang);
    } catch {}
    // Aligne la langue source de traduction sur la langue STT
    const bcp47 = STT_TO_BCP47[sttLang];
    if (bcp47) setSelectValueAndNotify(sourceLang, bcp47);

    refreshSttQualityOptions();

    if (usingVosk) {
      stopVosk();
      startVosk();
    } else {
      // force reload du modèle au prochain start
      voskModel = null;
    }
  });

  sttQualitySelect?.addEventListener("change", () => {
    applySttQuality(sttQualitySelect.value);
    // Recharge le modèle si on est en écoute.
    if (usingVosk) {
      stopVosk();
      startVosk();
    } else {
      voskModel = null;
    }
    setStatus(`Vosk: ${sttLang} — ${sttQuality}`, "info");
  });

  sttGrammarInput?.addEventListener("input", () => {
    try {
      localStorage.setItem("trad:sttGrammar", String(sttGrammarInput.value || ""));
    } catch {}
  });

  pptxExtractBtn?.addEventListener("click", async () => {
    try {
      if (!pptxFileInput?.files?.[0]) {
        setStatus("Choisis un fichier .pptx d’abord.", "danger");
        return;
      }
      setStatus("PPTX: extraction des termes…", "info");
      setModelProgress("indeterminate");

      const lines = await extractGrammarFromPptxFile(pptxFileInput.files[0]);
      if (!lines.length) {
        setStatus("PPTX: aucun terme pertinent détecté (essaie un autre deck).", "danger");
        setModelProgress(null);
        return;
      }

      const existing = String(sttGrammarInput?.value || "").trim();
      const next = (pptxAppendCheck?.checked && existing
        ? existing.split("\n").concat(lines)
        : lines
      )
        .map((s) => normalizeTerm(s))
        .filter(Boolean);

      // Dédoublonne en gardant l'ordre
      const seen = new Set();
      const uniq = [];
      for (const l of next) {
        const k = l.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(l);
        if (uniq.length >= 1200) break;
      }

      if (sttGrammarInput) sttGrammarInput.value = uniq.join("\n");
      try {
        localStorage.setItem("trad:sttGrammar", String(sttGrammarInput?.value || ""));
      } catch {}
      setModelProgress(null);
      setStatus(`PPTX: ${uniq.length} termes/phrases ajoutés à la grammaire.`, "good");
    } catch (e) {
      setModelProgress(null);
      setStatus(`PPTX: échec (${String(e?.message || e)})`, "danger");
    }
  });

  // Réglages pop-up (fenêtre principale)
  try {
    const saved = Number(localStorage.getItem("trad:popupFontSize"));
    if (Number.isFinite(saved) && saved >= 12 && saved <= 72) popupFontSize = saved;
    const savedBg = localStorage.getItem("trad:popupBg");
    if (typeof savedBg === "string" && /^#[0-9a-fA-F]{6}$/.test(savedBg)) popupBg = savedBg;
    // Migration: anciens défauts/états possibles = 1.0 (100%) ou 0.0 (0%).
    // Nouveau défaut souhaité = 0.7 (70%).
    // On ne force qu'une seule fois (pour corriger les anciens états).
    const migratedKey = "trad:popupBgOpacityMigrated";
    const hasMigrated = localStorage.getItem(migratedKey) === "1";
    const rawOp = localStorage.getItem("trad:popupBgOpacity");
    const savedOp = Number(rawOp);
    const shouldMigrateDefault =
      !hasMigrated &&
      // clé absente (premier lancement), ou valeur “extrême” souvent issue d’anciens défauts/bugs
      (rawOp == null || savedOp === 0 || savedOp === 1);

    if (shouldMigrateDefault) {
      popupBgOpacity = 0.7;
      localStorage.setItem("trad:popupBgOpacity", String(popupBgOpacity));
      localStorage.setItem(migratedKey, "1");
    } else if (Number.isFinite(savedOp) && savedOp >= 0 && savedOp <= 1) {
      popupBgOpacity = savedOp;
    }
    const savedNoFrame = localStorage.getItem("trad:popupNoFrame");
    if (savedNoFrame === "1" || savedNoFrame === "0") popupNoFrame = savedNoFrame === "1";
    const savedAot = localStorage.getItem("trad:popupAlwaysOnTop");
    if (savedAot === "1" || savedAot === "0") popupAlwaysOnTop = savedAot === "1";
    const savedResizable = localStorage.getItem("trad:popupResizable");
    if (savedResizable === "1" || savedResizable === "0") popupResizable = savedResizable === "1";
    const savedFontFamily = localStorage.getItem("trad:popupFontFamily");
    if (savedFontFamily) popupFontFamily = savedFontFamily;
    const savedBold = localStorage.getItem("trad:popupFontBold");
    if (savedBold === "1" || savedBold === "0") popupFontBold = savedBold === "1";
  } catch {
    // ignore
  }
  if (popupFontRange) popupFontRange.value = String(popupFontSize);
  if (popupBgInput) popupBgInput.value = popupBg;
  if (popupOpacityRange) popupOpacityRange.value = String(Math.round(popupBgOpacity * 100));
  if (popupOpacityLabel) popupOpacityLabel.textContent = `${Math.round(popupBgOpacity * 100)}%`;
  if (popupNoFrameCheck) popupNoFrameCheck.checked = popupNoFrame;
  if (popupAlwaysOnTopCheck) popupAlwaysOnTopCheck.checked = popupAlwaysOnTop;
  if (popupResizableCheck) popupResizableCheck.checked = popupResizable;
  if (popupFontFamilySelect) popupFontFamilySelect.value = popupFontFamily;
  if (popupFontBoldCheck) popupFontBoldCheck.checked = popupFontBold;

  // Moteur de traduction
  try {
    const savedProvider = localStorage.getItem("trad:translateProvider");
    if (savedProvider && Object.values(PROVIDERS).includes(savedProvider)) {
      translateProvider = savedProvider;
    }
  } catch {}
  // Si l'option est désactivée dans l'UI (pas d'API), on force Google.
  if (
    translateProviderSelect &&
    translateProviderSelect.querySelector(`option[value="${translateProvider}"]`)?.disabled
  ) {
    translateProvider = PROVIDERS.google;
    try {
      localStorage.setItem("trad:translateProvider", translateProvider);
    } catch {}
  }
  if (translateProviderSelect) translateProviderSelect.value = translateProvider;
  translateProviderSelect?.addEventListener("change", () => {
    const v = translateProviderSelect.value;
    if (Object.values(PROVIDERS).includes(v)) {
      // Empêche de sélectionner une option grisée.
      if (translateProviderSelect.selectedOptions?.[0]?.disabled) {
        translateProviderSelect.value = PROVIDERS.google;
        translateProvider = PROVIDERS.google;
        return;
      }
      translateProvider = v;
      try {
        localStorage.setItem("trad:translateProvider", translateProvider);
      } catch {}
      setStatus(`Moteur de traduction: ${translateProvider}`, "info");
    }
  });

  // Status updates pour le modèle local (téléchargement/démarrage)
  window.tradDesktop?.onLocalStatus?.((payload) => {
    const stage = payload?.stage ? String(payload.stage) : "Local…";
    const p = typeof payload?.progress === "number" ? payload.progress : null;
    setStatus(p == null ? stage : `${stage} (${p}%)`, "info");
    // Réutilise la barre de progression (même UX que Vosk).
    if (p == null) setModelProgress("indeterminate");
    else setModelProgress(p);
  });

  // Raccourcis de langues (assignables)
  initLangPresets({
    storagePrefix: "trad:spokenPreset:",
    buttons: spokenPresetBtns,
    selects: spokenPresetSels,
    mainSelect: window.tradDesktop && HAS_VOSK ? sttLangSelect : sourceLang,
    defaultCodes: ["fr-FR", "en-US", "es-ES", "de-DE"],
    allowAuto: false,
  });
  initLangPresets({
    storagePrefix: "trad:targetPreset:",
    buttons: targetPresetBtns,
    selects: targetPresetSels,
    mainSelect: targetLang,
    defaultCodes: ["en-US", "fr-FR", "es-ES", "de-DE"],
    allowAuto: false,
  });

  if (window.tradDesktop && HAS_VOSK) {
    setStatus(
      "Mode Electron: dictée via Vosk (offline). Assure-toi d’avoir téléchargé le modèle Vosk.",
      "info",
    );
  } else if (!SpeechRec) {
    setStatus(
      window.tradDesktop
        ? "Attention: la reconnaissance vocale Web (SpeechRecognition) peut être indisponible dans Electron. Si le bouton Démarrer est grisé, lance le mode navigateur (Chrome) ou on intégrera un moteur STT (Whisper/Vosk)."
        : "Attention: Web Speech API non supportée ici. Essaie Chrome desktop.",
      "danger",
    );
    startBtn.disabled = true;
  }

  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  popupBtn.addEventListener("click", () => {
    const isOpen = window.tradDesktop
      ? popupDesktopOpen
      : popupWin && !popupWin.closed;
    if (isOpen) closePopup();
    else openOrFocusPopup();
    popupBtn.textContent =
      (window.tradDesktop ? popupDesktopOpen : popupWin && !popupWin.closed)
        ? "Fermer fenêtre"
        : "Fenêtre flottante";
  });

  // Plus de handshake postMessage: la pop-up utilise BroadcastChannel (hello/state).
  window.tradDesktop?.onPopupClosed?.(() => {
    popupDesktopOpen = false;
    popupBtn.textContent = "Fenêtre flottante";
  });

  const applyPopupFont = (next) => {
    const n = Math.max(12, Math.min(72, Number(next)));
    if (!Number.isFinite(n)) return;
    popupFontSize = n;
    if (popupFontRange) popupFontRange.value = String(popupFontSize);
    try {
      localStorage.setItem("trad:popupFontSize", String(popupFontSize));
    } catch {
      // ignore
    }
    postToPopup(getPopupPayload());
  };

  popupFontRange?.addEventListener("input", (e) => applyPopupFont(e.target.value));
  popupBiggerBtn?.addEventListener("click", () => applyPopupFont(popupFontSize + 2));
  popupSmallerBtn?.addEventListener("click", () => applyPopupFont(popupFontSize - 2));

  const applyPopupStyle = () => {
    if (popupBgInput && /^#[0-9a-fA-F]{6}$/.test(popupBgInput.value)) popupBg = popupBgInput.value;
    if (popupOpacityRange) popupBgOpacity = Math.max(0, Math.min(1, Number(popupOpacityRange.value) / 100));
    if (popupOpacityLabel) popupOpacityLabel.textContent = `${Math.round(popupBgOpacity * 100)}%`;
    if (popupNoFrameCheck) popupNoFrame = Boolean(popupNoFrameCheck.checked);
    if (popupAlwaysOnTopCheck) popupAlwaysOnTop = Boolean(popupAlwaysOnTopCheck.checked);
    if (popupResizableCheck) popupResizable = Boolean(popupResizableCheck.checked);
    if (popupFontFamilySelect) popupFontFamily = popupFontFamilySelect.value;
    if (popupFontBoldCheck) popupFontBold = Boolean(popupFontBoldCheck.checked);
    try {
      localStorage.setItem("trad:popupBg", popupBg);
      localStorage.setItem("trad:popupBgOpacity", String(popupBgOpacity));
      localStorage.setItem("trad:popupNoFrame", popupNoFrame ? "1" : "0");
      localStorage.setItem("trad:popupAlwaysOnTop", popupAlwaysOnTop ? "1" : "0");
      localStorage.setItem("trad:popupResizable", popupResizable ? "1" : "0");
      localStorage.setItem("trad:popupFontFamily", popupFontFamily);
      localStorage.setItem("trad:popupFontBold", popupFontBold ? "1" : "0");
    } catch {
      // ignore
    }

    // Electron: applique aussi des propriétés de fenêtre natives
    window.tradDesktop?.popupSetAlwaysOnTop?.(popupAlwaysOnTop);
    window.tradDesktop?.popupSetResizable?.(popupResizable);

    postToPopup(getPopupPayload());
  };

  popupBgInput?.addEventListener("input", applyPopupStyle);
  popupOpacityRange?.addEventListener("input", applyPopupStyle);
  popupNoFrameCheck?.addEventListener("change", applyPopupStyle);
  popupAlwaysOnTopCheck?.addEventListener("change", applyPopupStyle);
  popupResizableCheck?.addEventListener("change", applyPopupStyle);
  popupFontFamilySelect?.addEventListener("change", applyPopupStyle);
  popupFontBoldCheck?.addEventListener("change", applyPopupStyle);
  clearBtn.addEventListener("click", () => {
    resetText();
    setStatus("Effacé.", "info");
    stopMicMonitor();
  });

  sourceLang.addEventListener("change", () => {
    if (isRunning) {
      setStatus("Langue changée: redémarre pour l’appliquer.", "info");
    }
  });
  targetLang.addEventListener("change", () => {
    // Changement de langue = on repart proprement (sinon mix de langues).
    translatedFinalAcc = "";
    interimTranslatedLast = "";
    recentFinalPieces = [];
    if (interimAbort) interimAbort.abort();
    interimAbort = null;
    translateDebounced();
  });
  sourceLang.addEventListener("change", () => {
    translatedFinalAcc = "";
    interimTranslatedLast = "";
    recentFinalPieces = [];
    if (interimAbort) interimAbort.abort();
    interimAbort = null;
    translateDebounced();
    postToPopup(getPopupPayload());
  });
  micSelect.addEventListener?.("change", () => postToPopup(getPopupPayload()));
  micSelect.addEventListener?.("change", () => {
    // Mise à jour immédiate du VU mètre sur le nouveau micro
    if (isRunning) {
      startMicMonitor().catch(() => {});
    }
  });

  // Remplir les micros dès le chargement (demandera une permission).
  requestMicAndListDevices();
  navigator.mediaDevices?.addEventListener?.("devicechange", requestMicAndListDevices);

  // Aide (modal)
  helpBtn?.addEventListener("click", () => openHelp());
  helpCloseBtn?.addEventListener("click", () => closeHelp());
  helpModal?.addEventListener("click", (e) => {
    // clic sur l'overlay (en dehors de la carte) => ferme
    if (e?.target === helpModal) closeHelp();
  });
  window.addEventListener("keydown", (e) => {
    if (e?.key === "Escape") {
      closeHelp();
      closeOnboarding();
    }
  });

  // Avant de commencer (modal au lancement)
  const onboardingKey = "trad:onboardingHidden";
  let hidden = false;
  try {
    hidden = localStorage.getItem(onboardingKey) === "1";
  } catch {}
  if (!hidden) {
    // Laisse le DOM respirer (meilleure UX au chargement)
    setTimeout(() => openOnboarding(), 120);
  }

  const commitOnboardingChoice = () => {
    const dontShow = Boolean(onboardingDontShowCheck?.checked);
    try {
      localStorage.setItem(onboardingKey, dontShow ? "1" : "0");
    } catch {}
  };

  onboardingOkBtn?.addEventListener("click", () => {
    commitOnboardingChoice();
    closeOnboarding();
  });
  onboardingCloseBtn?.addEventListener("click", () => {
    commitOnboardingChoice();
    closeOnboarding();
  });
  onboardingModal?.addEventListener("click", (e) => {
    if (e?.target === onboardingModal) {
      commitOnboardingChoice();
      closeOnboarding();
    }
  });

  window.addEventListener("beforeunload", () => closePopup());
}

init();
