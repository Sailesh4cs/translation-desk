const HISTORY_KEY = "translation-desk:history";
const HISTORY_PREF_KEY = "translation-desk:save-history";
const HISTORY_LIMIT = 20;

const $ = (id) => document.getElementById(id);
const els = {
  badge: $("mode-badge"),
  banner: $("demo-banner"),
  demoLanguages: $("demo-languages"),
  demoPhrases: $("demo-phrases"),
  form: $("translate-form"),
  source: $("source-language"),
  target: $("target-language"),
  swap: $("swap"),
  text: $("source-text"),
  count: $("char-count"),
  clear: $("clear"),
  output: $("output"),
  meta: $("result-meta"),
  copy: $("copy"),
  error: $("error"),
  submit: $("submit"),
  saveHistory: $("save-history"),
  historyList: $("history-list"),
  historyEmpty: $("history-empty"),
  clearHistory: $("clear-history"),
};

let config = { maxTextLength: 5000, languages: [] };
let languageNames = new Map();

function option(value, label) {
  const el = document.createElement("option");
  el.value = value;
  el.textContent = label;
  return el;
}

function setOutput(text, { placeholder = false, loading = false } = {}) {
  els.output.replaceChildren();
  els.output.classList.toggle("loading", loading);
  if (placeholder) {
    const span = document.createElement("span");
    span.className = "placeholder";
    span.textContent = text;
    els.output.append(span);
  } else {
    els.output.textContent = text;
  }
  els.copy.disabled = placeholder || loading;
}

function showError(message, extra) {
  els.error.replaceChildren();
  const p = document.createElement("div");
  p.textContent = message;
  els.error.append(p);
  if (extra) {
    const small = document.createElement("div");
    small.className = "small";
    small.textContent = extra;
    els.error.append(small);
  }
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.replaceChildren();
}

function updateCount() {
  const length = [...els.text.value].length;
  els.count.textContent = `${length} / ${config.maxTextLength}`;
  els.count.style.color = length > config.maxTextLength ? "var(--error)" : "";
}

function readHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function writeHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
  } catch {
    /* storage may be unavailable (private mode); history is optional */
  }
}

function renderHistory() {
  const items = readHistory();
  els.historyList.replaceChildren();
  els.historyEmpty.hidden = items.length > 0;
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "history-item";
    const langs = document.createElement("span");
    langs.className = "langs";
    langs.textContent = `${item.sourceLanguage} → ${item.targetLanguage} · ${item.mode} · ${new Date(item.at).toLocaleString()}`;
    const src = document.createElement("span");
    src.className = "src";
    src.textContent = item.text;
    const out = document.createElement("span");
    out.textContent = item.translation;
    const reuse = document.createElement("button");
    reuse.type = "button";
    reuse.className = "link-button";
    reuse.textContent = "Load";
    reuse.addEventListener("click", () => {
      els.text.value = item.text;
      if (languageNames.has(item.sourceLanguage) || item.sourceLanguage === "auto") els.source.value = item.sourceLanguage;
      if (languageNames.has(item.targetLanguage)) els.target.value = item.targetLanguage;
      setOutput(item.translation);
      updateCount();
      els.text.focus();
    });
    li.append(langs, src, out, reuse);
    els.historyList.append(li);
  }
}

function describeError(payload, status) {
  const error = payload?.error;
  if (!error) return { message: `Request failed (HTTP ${status}).` };
  let extra;
  if (error.details?.fields) extra = Object.values(error.details.fields).join(" ");
  else if (error.details?.examples) extra = `Try one of: ${error.details.examples.join(" · ")}`;
  else if (error.details?.demoLanguages) extra = `Demo languages: ${error.details.demoLanguages.map((c) => languageNames.get(c) ?? c).join(", ")}`;
  return { message: error.message, extra };
}

async function translate() {
  clearError();
  const text = els.text.value;
  if (!text.trim()) {
    showError("Enter some text to translate.");
    els.text.focus();
    return;
  }
  if ([...text].length > config.maxTextLength) {
    showError(`Text must be at most ${config.maxTextLength} characters.`);
    return;
  }
  const body = { text, sourceLanguage: els.source.value, targetLanguage: els.target.value };
  els.submit.disabled = true;
  setOutput("Translating…", { loading: true });
  els.meta.textContent = "";
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const { message, extra } = describeError(payload, response.status);
      showError(message, extra);
      setOutput("Translation will appear here.", { placeholder: true });
      return;
    }
    setOutput(payload.translation);
    const detected = payload.detectedSourceLanguage ? `detected ${languageNames.get(payload.detectedSourceLanguage) ?? payload.detectedSourceLanguage} · ` : "";
    els.meta.textContent = `${detected}${payload.mode === "demo" ? "demo phrase book" : payload.model} · ${payload.durationMs} ms`;
    if (els.saveHistory.checked) {
      writeHistory([
        { text: text.trim(), translation: payload.translation, sourceLanguage: body.sourceLanguage, targetLanguage: body.targetLanguage, mode: payload.mode, at: Date.now() },
        ...readHistory(),
      ]);
      renderHistory();
    }
  } catch {
    showError("Could not reach the Translation Desk server. Is it running?");
    setOutput("Translation will appear here.", { placeholder: true });
  } finally {
    els.submit.disabled = false;
  }
}

async function init() {
  const prefersHistory = localStorage.getItem(HISTORY_PREF_KEY);
  els.saveHistory.checked = prefersHistory !== "false";
  renderHistory();

  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error();
    config = await response.json();
  } catch {
    els.badge.textContent = "Server unavailable";
    showError("Could not load configuration from the server.");
    return;
  }

  languageNames = new Map(config.languages.map((language) => [language.code, language.name]));
  els.source.append(option("auto", "Detect language"));
  for (const language of config.languages) {
    els.source.append(option(language.code, language.name));
    els.target.append(option(language.code, language.name));
  }
  els.source.value = "auto";
  els.target.value = "es";

  if (config.mode === "demo") {
    els.badge.textContent = "Demo mode · phrase book";
    els.badge.classList.add("demo");
    els.banner.hidden = false;
    els.demoLanguages.textContent = config.demo.languages.map((code) => languageNames.get(code) ?? code).join(", ");
    for (const phrase of config.demo.phrases) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = phrase;
      chip.addEventListener("click", () => {
        els.text.value = phrase;
        els.source.value = "en";
        if (els.target.value === "en") els.target.value = "es";
        updateCount();
        translate();
      });
      els.demoPhrases.append(chip);
    }
  } else {
    els.badge.textContent = `AI provider · ${config.model}`;
    els.badge.classList.add("provider");
  }
  updateCount();
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  translate();
});
els.text.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    translate();
  }
});
els.text.addEventListener("input", updateCount);
els.clear.addEventListener("click", () => {
  els.text.value = "";
  updateCount();
  clearError();
  setOutput("Translation will appear here.", { placeholder: true });
  els.meta.textContent = "";
  els.text.focus();
});
els.swap.addEventListener("click", () => {
  if (els.source.value === "auto") return;
  const source = els.source.value;
  els.source.value = els.target.value;
  els.target.value = source;
  const current = els.output.querySelector(".placeholder") ? "" : els.output.textContent;
  if (current) {
    els.text.value = current;
    setOutput("Translation will appear here.", { placeholder: true });
    updateCount();
  }
});
els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.output.textContent);
    els.copy.textContent = "Copied";
    setTimeout(() => (els.copy.textContent = "Copy"), 1500);
  } catch {
    showError("Clipboard access was blocked by the browser.");
  }
});
els.saveHistory.addEventListener("change", () => {
  localStorage.setItem(HISTORY_PREF_KEY, String(els.saveHistory.checked));
});
els.clearHistory.addEventListener("click", () => {
  writeHistory([]);
  renderHistory();
});

init();