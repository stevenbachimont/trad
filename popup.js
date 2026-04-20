const el = document.getElementById("text");
const card = el.closest(".card");
const wrap = document.querySelector(".wrap");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function lastLines(raw, n) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "—";
  const normalized = trimmed.replaceAll("\r", "");
  const lines = normalized
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 0) return trimmed;
  return lines.slice(-n).join("\n");
}

function applyState(payload) {
  if (!payload) return;
  if (typeof payload.popupFontSize === "number") {
    el.style.fontSize = `${clamp(payload.popupFontSize, 12, 72)}px`;
  }
  if (typeof payload.popupFontFamily === "string") {
    const v = payload.popupFontFamily;
    if (v === "mono") {
      el.style.fontFamily =
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    } else if (v === "serif") {
      el.style.fontFamily =
        'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
    } else {
      el.style.fontFamily =
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    }
  }
  if (typeof payload.popupFontBold === "boolean") {
    el.style.fontWeight = payload.popupFontBold ? "800" : "500";
  }
  if (typeof payload.popupBg === "string") {
    const hex = payload.popupBg.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a =
        typeof payload.popupBgOpacity === "number"
          ? clamp(payload.popupBgOpacity, 0, 1)
          : 1;
      document.body.style.background = `rgba(${r},${g},${b},${a})`;
    }
  }
  if (typeof payload.popupNoFrame === "boolean" && card && wrap) {
    if (payload.popupNoFrame) {
      card.style.background = "transparent";
      card.style.border = "none";
      card.style.borderRadius = "0";
      card.style.boxShadow = "none";
      wrap.style.padding = "0";
    } else {
      card.style.background = "rgba(0,0,0,.12)";
      card.style.border = "1px solid rgba(255,255,255,.12)";
      card.style.borderRadius = "14px";
      card.style.boxShadow = "0 18px 50px rgba(0,0,0,.35)";
      wrap.style.padding = "12px";
    }
  }
  el.textContent = lastLines(
    payload.translatedLiveOnly || payload.translatedFinalOnly,
    4,
  );
  // Effet "défilement": se cale toujours sur le bas
  try {
    el.scrollTop = el.scrollHeight;
  } catch {}
}

// Electron: écoute l'IPC si disponible
if (window.tradDesktop?.onPopupState) {
  window.tradDesktop.onPopupState((payload) => applyState(payload));
} else {
  // Web fallback (si on ouvre popup.html dans un navigateur)
  let bc = null;
  if ("BroadcastChannel" in window) {
    bc = new BroadcastChannel("trad_live");
    bc.addEventListener("message", (ev) => {
      const msg = ev?.data;
      if (!msg || msg.type !== "state") return;
      applyState(msg.payload);
    });
    bc.postMessage({ type: "hello" });
  }
  window.addEventListener("message", (ev) => {
    const msg = ev?.data;
    if (!msg || msg.type !== "trad:update") return;
    applyState(msg.payload);
  });
}

