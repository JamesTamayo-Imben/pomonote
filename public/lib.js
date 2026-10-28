// Pure helpers + the persisted store. No DOM work except the error event.
export const $ = (s) => document.querySelector(s);
export const uid = () => crypto.randomUUID().slice(0, 8);
export const day = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return day(d); };
export const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---- store: one JSON blob in localStorage, debounced writes, flushed on page hide
const KEY = "pomonote.v2";
const DEF = { tasks: [], notes: [], sessions: [],
  cfg: { focus: 25, short: 5, long: 15, every: 4, auto: false, sound: true, theme: "auto" },
  timer: { mode: "focus", running: false, endAt: 0, left: 25 * 60000, len: 25 * 60000, label: "", task: null } };
const readState = () => {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch { return structuredClone(DEF); }
  if (raw === null) return structuredClone(DEF);
  try { const s = JSON.parse(raw); return { ...DEF, ...s, cfg: { ...DEF.cfg, ...s?.cfg }, timer: { ...DEF.timer, ...s?.timer } }; }
  catch {
    let message = "Stored data was corrupt; a backup was kept.";
    try { localStorage.setItem(KEY + ".corrupt", raw); } catch { message = "Stored data was corrupt, but its backup could not be saved."; }
    setTimeout(() => document.dispatchEvent(new CustomEvent("pn:error", { detail: message })), 0);
    return structuredClone(DEF);
  }
};
export const state = readState();
export function reloadState() {
  const next = readState();
  Object.assign(state, next, { cfg: state.cfg, timer: state.timer });
  Object.assign(state.cfg, next.cfg); Object.assign(state.timer, next.timer);
}
export const flush = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { document.dispatchEvent(new CustomEvent("pn:error", { detail: "Could not save (storage full or blocked). Export your data." })); } };
let t; export const save = () => { clearTimeout(t); t = setTimeout(flush, 250); };
addEventListener("pagehide", flush);

// ---- quick-add: "Review draft tomorrow #work !1 ~3"
const WORDS = "today|tomorrow|tmr|sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?";
const TOKEN = new RegExp(`(^|\\s)(#(\\w+)|!([1-3])|~(\\d+)|(next\\s+week)|in\\s+(\\d+)\\s+days?|(${WORDS}))([.,!?;:]?)(?=\\s|$)`, "gi");
export function parseTask(raw) {
  const t = { pri: 0, due: null, list: "Inbox", est: 0 };
  const hasTitle = /[\p{L}\p{N}]/u.test(raw.replace(TOKEN, " "));
  const title = raw.replace(TOKEN, (_m, sp, _tok, list, pri, est, nextWeek, inDays, w) => {
    if (list) t.list = list; else if (pri) t.pri = +pri; else if (est) t.est = Math.min(20, +est);
    else { const now = day();
      if (nextWeek) { const have = new Date(now + "T12:00").getDay(); t.due = addDays(now, (1 - have + 7) % 7 || 7); }
      else if (inDays) t.due = addDays(now, +inDays);
      else { const k = w.slice(0, 3).toLowerCase();
        if (k !== "tod" && k !== "tom" && k !== "tmr" && !hasTitle) return _m;
        if (k === "tod") t.due = now; else if (k === "tom" || k === "tmr") t.due = addDays(now, 1);
        else { const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(k), have = new Date(now + "T12:00").getDay(); t.due = addDays(now, (want - have + 7) % 7 || 7); } } }
    return sp;
  }).replace(/\s+/g, " ").trim();
  return { ...t, title: title || raw };
}

// ---- markdown -> safe HTML (everything is escaped first; only http(s) links)
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
  .replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
export function md(src) {
  const out = []; let code = null, list = false;
  const close = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const l of src.split("\n")) {
    if (l.startsWith("```")) { if (code === null) { close(); code = []; } else { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } continue; }
    if (code) { code.push(l); continue; }
    let m;
    if ((m = l.match(/^(#{1,3}) (.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = l.match(/^[-*] (\[[ xX]\] )?(.*)/))) { if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${m[1] ? `<input type="checkbox" disabled${/x/i.test(m[1]) ? " checked" : ""}> ` : ""}${inline(m[2])}</li>`); }
    else if (/^---+$/.test(l)) { close(); out.push("<hr>"); }
    else if ((m = l.match(/^> ?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (l.trim()) { close(); out.push(`<p>${inline(l)}</p>`); } else close();
  }
  if (code) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  close(); return out.join("");
}

export const MAX_SUB = 10;
export function normalize(notes) {
  const byId = (id) => notes.find((n) => n.id === id), kids = (p) => notes.filter((n) => n.parent === p);
  for (const n of notes) { const p = byId(n.parent); if (!p) n.parent = null; else if (p.parent) n.parent = p.parent; }
  for (const r of notes.filter((n) => !n.parent)) kids(r.id).slice(MAX_SUB).forEach((k) => (k.parent = null));
}
