/* ==================== WORD SEGMENTATION ==================== */
function segment(text) {
  if (window.Intl && Intl.Segmenter) {
    const s = new Intl.Segmenter("en", { granularity: "word" });
    return [...s.segment(text)].map(x => ({
      type: x.isWordLike ? "word" : "punct",
      value: x.segment
    }));
  }
  return text.split(/(\W+)/).map(v => ({
    type: /^[A-Za-z]+$/.test(v) ? "word" : "punct",
    value: v
  }));
}

const norm = s => s.toLowerCase();

/* ==================== TRANSLATION ==================== */
let DICT = null;
const CACHE_KEY = "pl-cache-v1";
const CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

async function loadDict() {
  if (DICT) return DICT;
  try {
    const r = await fetch("./dictionary.en-pl.json", { cache: "no-store" });
    DICT = await r.json();
  } catch {
    DICT = {};
  }
  return DICT;
}

async function translate(word) {
  word = norm(word);
  if (DICT[word]) return DICT[word];
  if (CACHE[word]) return CACHE[word];

  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|pl`
    );
    const j = await r.json();
    const t = j?.responseData?.translatedText?.toLowerCase();
    if (t) {
      CACHE[word] = t;
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

const txt = t => document.createTextNode(t);

/* ==================== SIMPLE TOOLTIP ==================== */
function showTooltip(target, text) {
  const tip = el("div", {
    className: "tooltip",
    textContent: text
  });

  document.body.append(tip);
  const r = target.getBoundingClientRect();

  tip.style.position = "fixed";
  tip.style.top = `${r.top - 30}px`;
  tip.style.left = `${r.left}px`;
  tip.style.background = "#222";
  tip.style.color = "#fff";
  tip.style.padding = "4px 8px";
  tip.style.borderRadius = "6px";
  tip.style.fontSize = "13px";
  tip.style.zIndex = "9999";

  setTimeout(() => tip.remove(), 2000);
}

/* ==================== CLICKABLE TEXT ==================== */
function renderText(text) {
  const wrap = el("span");
  const parts = segment(text);

  parts.forEach(p => {
    if (p.type === "word") {
      const s = el("span", {
        className: "word",
        textContent: p.value
      });

      s.onclick = async e => {
        e.stopPropagation();
        s.style.pointerEvents = "none";
        const pl = await translate(p.value);
        s.style.pointerEvents = "";
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
let selected = null;
let revealed = false;

/* ==================== LOAD QUESTIONS ==================== */
async function loadQuestions() {
  const r = await fetch("./questions.json", { cache: "no-store" });
  questions = await r.json();
}

/* ==================== RENDER ==================== */
function render() {
  const q = questions[index];
  const root = el("div", { className: "container" });

  root.append(el("h1", { textContent: `Pytanie ${index + 1}` }));
  root.append(el("div", {}, [renderText(q.question)]));

  const choices = el("div", { className: "choices" });

  q.choices.forEach((c, i) => {
    let cls = "choice";
    if (revealed) {
      if (i === q.answerIndex) cls += " correct";
      else if (i === selected) cls += " wrong";
    } else if (i === selected) {
      cls += " selected";
    }

    const btn = el("div", { className: cls });
    btn.append(renderText(c));

    btn.onclick = () => {
      if (revealed) return;
      selected = i;
      render();
    };

    choices.append(btn);
  });

  root.append(choices);

  root.append(
    el("button", {
      textContent: revealed ? "Ukryj odpowiedź" : "Sprawdź",
      disabled: selected === null,
      onclick: () => {
        revealed = !revealed;
        render();
      }
    })
  );

  root.append(
    el("div", { className: "controls" }, [
      el("button", {
        textContent: "Wstecz",
        disabled: index === 0,
        onclick: () => {
          index--;
          selected = null;
          revealed = false;
          render();
        }
      }),
      el("button", {
        textContent: "Dalej",
        disabled: index === questions.length - 1,
        onclick: () => {
          index++;
          selected = null;
          revealed = false;
          render();
        }
      })
    ])
  );

  app.replaceChildren(root);
}

/* ==================== BOOT ==================== */
(async () => {
  await loadDict();
  await loadQuestions();
  render();
})();
