/* ==================== WORD SEGMENTATION ==================== */
function segment(text) {
  if (window.Intl && Intl.Segmenter) {
    const s = new Intl.Segmenter("en", { granularity: "word" });
    return [...s.segment(text)].map(x => ({
      type: x.isWordLike ? "word" : "punct",
      value: x.segment
    }));
  }
  return String(text).split(/(\W+)/).map(v => ({
    type: /^[A-Za-z]+$/.test(v) ? "word" : "punct",
    value: v
  }));
}

const norm = s => String(s || "").toLowerCase();

/* ==================== TRANSLATION ==================== */
let DICT = null;
const CACHE_KEY = "pl-cache-v1";
const CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

async function loadDict() {
  if (DICT) return DICT;
  try {
    const r = await fetch("./dictionary.en-pl.json", { cache: "no-store" });
    const j = await r.json();
    const fixed = {};
    for (const [k, v] of Object.entries(j || {})) {
      fixed[norm(k)] = norm(v);
    }
    DICT = fixed;
  } catch {
    DICT = {};
  }
  return DICT;
}

async function translate(word) {
  const key = norm(word);
  if (!key) return "";

  if (DICT && DICT[key]) return DICT[key];
  if (CACHE[key]) return CACHE[key];

  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|pl`
    );
    const j = await r.json();
    const t = norm(j?.responseData?.translatedText || "");
    if (t) {
      CACHE[key] = t;
      localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE));
      return t;
    }
  } catch {}

  return "(brak tłumaczenia)";
}

/* ==================== UI HELPERS ==================== */
const app = document.querySelector("#app");

const el = (tag, props = {}, children = []) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  children.forEach(c => n.append(c));
  return n;
};

const txt = t => document.createTextNode(String(t));

/* ==================== SIMPLE TOOLTIP ==================== */
let activeTip = null;
let activeTipTimer = null;

function showTooltip(target, text) {
  if (activeTip) {
    try { activeTip.remove(); } catch {}
    activeTip = null;
  }
  if (activeTipTimer) {
    clearTimeout(activeTipTimer);
    activeTipTimer = null;
  }

  const tip = el("div", { className: "tooltip", textContent: String(text || "") });
  document.body.append(tip);

  const r = target.getBoundingClientRect();
  const padding = 8;

  tip.style.position = "fixed";
  tip.style.background = "#222";
  tip.style.color = "#fff";
  tip.style.padding = "6px 10px";
  tip.style.borderRadius = "8px";
  tip.style.fontSize = "13px";
  tip.style.zIndex = "9999";
  tip.style.maxWidth = "260px";
  tip.style.whiteSpace = "nowrap";

  // position above the word, clamp to viewport
  const tipRect = tip.getBoundingClientRect();
  let left = r.left;
  let top = r.top - tipRect.height - 10;

  if (left + tipRect.width > window.innerWidth - padding) left = window.innerWidth - tipRect.width - padding;
  if (left < padding) left = padding;
  if (top < padding) top = r.bottom + 10;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;

  activeTip = tip;
  activeTipTimer = setTimeout(() => {
    try { tip.remove(); } catch {}
    if (activeTip === tip) activeTip = null;
    activeTipTimer = null;
  }, 2000);
}

/* ==================== CLICKABLE TEXT ==================== */
function renderText(text) {
  const wrap = el("span");
  const parts = segment(String(text || ""));

  parts.forEach(p => {
    if (p.type === "word") {
      const s = el("span", { className: "word", textContent: p.value });

      s.onclick = async e => {
        e.stopPropagation();
        const w = norm(p.value);
        if (!w) return;

        s.style.pointerEvents = "none";
        let pl = "";
        try {
          pl = await translate(w);
        } finally {
          s.style.pointerEvents = "";
        }
        showTooltip(s, pl);
      };

      wrap.append(s);
    } else {
      wrap.append(txt(p.value));
    }
  });

  return wrap;
}

/* ==================== APP STATE ==================== */
let questions = [];
let index = 0;
let selected = null; // 0..n-1
let checked = false; // locks grading state

/* ==================== LOAD QUESTIONS ==================== */
async function loadQuestions() {
  const r = await fetch("./questions.json", { cache: "no-store" });
  const j = await r.json();
  questions = Array.isArray(j) ? j : [];
}

/* ==================== RENDER ==================== */
function render() {
  const q = questions[index];

  const root = el("div", { className: "container" });

  if (!q) {
    root.append(el("div", { className: "card" }, [
      el("h1", { textContent: "Brak pytań" }),
      el("div", { className: "note", textContent: "Dodaj pytania do pliku docs/questions.json" })
    ]));
    app.replaceChildren(root);
    return;
  }

  const card = el("div", { className: "card" });

  card.append(el("h1", { textContent: `Pytanie ${index + 1}` }));
  card.append(el("div", { className: "question" }, [renderText(q.question)]));

  const choicesWrap = el("div", { className: "choices" });

  const answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : -1;
  const choices = Array.isArray(q.choices) ? q.choices : [];

  choices.forEach((c, i) => {
    const isSelected = selected === i;
    const isCorrect = i === answerIndex;

    let cls = "choice";
    if (!checked) {
      if (isSelected) cls += " selected";
    } else {
      if (isCorrect) cls += " correct";
      if (isSelected && !isCorrect) cls += " wrong";
    }

    const btn = el("div", { className: cls, role: "button", tabIndex: 0 });
    btn.append(el("div", {}, [renderText(c)]));

    const pick = () => {
      if (checked) return;
      selected = i;
      render();
    };

    btn.onclick = pick;
    btn.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick();
      }
    };

    choicesWrap.append(btn);
  });

  card.append(choicesWrap);

  const checkBtn = el("button", {
    textContent: checked ? "Sprawdzone" : "Sprawdź",
    disabled: checked || selected === null || answerIndex < 0,
    onclick: () => {
      checked = true;
      render();
    }
  });

  card.append(checkBtn);

  const controls = el("div", { className: "controls" }, [
    el("button", {
      textContent: "Wstecz",
      disabled: index === 0,
      onclick: () => {
        index = Math.max(0, index - 1);
        selected = null;
        checked = false;
        render();
      }
    }),
    el("button", {
      textContent: "Dalej",
      disabled: index >= questions.length - 1,
      onclick: () => {
        index = Math.min(questions.length - 1, index + 1);
        selected = null;
        checked = false;
        render();
      }
    })
  ]);

  card.append(controls);

  root.append(card);
  app.replaceChildren(root);
}

/* ==================== BOOT ==================== */
(async () => {
  await loadDict();
  await loadQuestions();
  render();
})();
