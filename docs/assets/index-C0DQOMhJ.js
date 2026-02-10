import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";

/* -------------------- WORD SEGMENTATION -------------------- */
function segment(text) {
  if (Intl?.Segmenter) {
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

/* -------------------- TRANSLATION -------------------- */
let DICT = null;
const CACHE_KEY = "pl-cache-v1";
const CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

async function loadDict() {
  if (DICT) return DICT;
  try {
    const r = await fetch("./dictionary.en-pl.json");
    DICT = await r.json();
  } catch {
    DICT = {};
  }
  return DICT;
}

async function translate(word) {
  word = norm(word);
  if (DICT?.[word]) return DICT[word];
  if (CACHE[word]) return CACHE[word];

  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${word}&langpair=en|pl`
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

/* -------------------- UI HELPERS -------------------- */
const app = document.querySelector("#app");
const el = (t, p = {}, c = []) => {
  const n = document.createElement(t);
  Object.assign(n, p);
  c.forEach(x => n.append(x));
  return n;
};
const txt = t => document.createTextNode(t);

/* -------------------- CLICKABLE TEXT -------------------- */
function renderText(text) {
  const wrap = el("div", { className: "question" });
  const parts = segment(text);

  parts.forEach(p => {
    if (p.type === "word") {
      const s = el("span", { className: "word", textContent: p.value });
      s.onclick = async () => {
        s.style.pointerEvents = "none";
        const pl = await translate(p.value);
        s.style.pointerEvents = "";

        const tip = tippy(s, {
          content: `<b>${pl}</b>`,
          allowHTML: true,
          trigger: "manual",
          placement: "top"
        });
        tip.show();
        setTimeout(() => tip.destroy(), 2000);
      };
      wrap.append(s);
    } else {
      wrap.append(txt(p.value));
    }
  });

  return wrap;
}

/* -------------------- APP STATE -------------------- */
let questions = [];
let index = 0;
let selected = null;
let revealed = false;

/* -------------------- LOAD QUESTIONS -------------------- */
async function loadQuestions() {
  const r = await fetch("./questions.json");
  questions = await r.json();
}

/* -------------------- RENDER -------------------- */
function render() {
  const q = questions[index];
  const root = el("div", { className: "container" });

  root.append(el("h1", { textContent: "Pytanie" }));
  root.append(renderText(q.question));

  const choices = el("div", { className: "choices" });
  q.choices.forEach((c, i) => {
    let cls = "choice";
    if (revealed) {
      if (i === q.answerIndex) cls += " correct";
      else if (i === selected) cls += " wrong";
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

/* -------------------- BOOT -------------------- */
(async () => {
  await loadDict();
  await loadQuestions();
  render();
})();
