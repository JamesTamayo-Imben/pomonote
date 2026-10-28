// Pure helpers + the persisted store. No DOM work except the error event.
export const $ = (s) => document.querySelector(s);
export const uid = () => crypto.randomUUID().slice(0, 8);
export const day = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return day(d); };
export const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---- store: one JSON blob in localStorage, debounced writes, flushed on page hide
const KEY = "pomonote.v2";
const VERSION = 1, BACKUPS = KEY + ".backups", SYNC = KEY + ".sync", CORRUPT = KEY + ".corrupt";
const DEF = { version: VERSION, tasks: [], notes: [], sessions: [],
  cfg: { focus: 25, short: 5, long: 15, every: 4, auto: false, sound: true, theme: "auto" },
  timer: { mode: "focus", running: false, endAt: 0, left: 25 * 60000, len: 25 * 60000, label: "", task: null } };
const clone = (x) => structuredClone(x);
export function migrate(data) {
  const saved = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    ...DEF, ...saved, version: VERSION,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
    notes: Array.isArray(saved.notes) ? saved.notes : [],
    sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
    cfg: { ...DEF.cfg, ...saved.cfg },
    timer: { ...DEF.timer, ...saved.timer }
  };
}
export function validateImport(data) {
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.notes)
    || data.sessions !== undefined && !Array.isArray(data.sessions)) return null;
  const task = (x) => x && typeof x.id === "string" && typeof x.title === "string"
    && (x.due === null || typeof x.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.due))
    && Number.isInteger(x.pri) && x.pri >= 0 && x.pri <= 3
    && Number.isInteger(x.est) && x.est >= 0 && Number.isInteger(x.spent) && x.spent >= 0
    && typeof x.list === "string";
  const note = (x) => x && typeof x.id === "string" && typeof x.title === "string" && typeof x.body === "string";
  const session = (x) => x && Number.isFinite(x.t) && Number.isFinite(x.min)
    && (x.label === undefined || typeof x.label === "string")
    && (x.task === undefined || x.task === null || typeof x.task === "string");
  const tasks = data.tasks.filter(task), notes = data.notes.filter(note);
  const sessions = (data.sessions || []).filter(session);
  return { tasks, notes, sessions, skipped: data.tasks.length - tasks.length + data.notes.length - notes.length + (data.sessions || []).length - sessions.length };
}

let db = null, snapshotTime = 0;
const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open("pomonote", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("data");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Could not open IndexedDB."));
  request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked."));
});
const idbGet = (key) => new Promise((resolve, reject) => {
  const request = db.transaction("data", "readonly").objectStore("data").get(key);
  request.onsuccess = () => resolve(request.result ?? null);
  request.onerror = () => reject(request.error || new Error("Could not read IndexedDB."));
});
const idbSet = (key, value) => new Promise((resolve, reject) => {
  const request = db.transaction("data", "readwrite").objectStore("data").put(value, key);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error || new Error("Could not write IndexedDB."));
});
function localGet(key) {
  try { return localStorage.getItem(key); }
  catch { throw new Error("Could not read local storage; existing data was left untouched."); }
}
function localSet(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch { return false; }
}
function report(name, detail) {
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(name, { detail }));
}
async function getRaw(key) { return db ? idbGet(key) : localGet(key); }
async function setRaw(key, value) {
  if (db) await idbSet(key, value);
  else if (!localSet(key, value)) throw new Error("Could not save (storage full or blocked). Export your data.");
}
async function parseSaved(raw) {
  if (raw === null) return clone(DEF);
  try { return JSON.parse(raw); }
  catch {
    const savedLocally = localSet(CORRUPT, raw);
    try { if (db) await idbSet(CORRUPT, raw); else if (!savedLocally) throw new Error("Could not save corrupt data."); }
    catch { if (!savedLocally) throw new Error("Stored data was corrupt, and its backup could not be saved."); }
    setTimeout(() => report("pn:error", `Stored data was corrupt; a backup was kept${savedLocally ? "" : " in IndexedDB"}.`), 0);
    return clone(DEF);
  }
}
function assignState(target, next) {
  Object.assign(target, next, { cfg: target.cfg, timer: target.timer });
  Object.assign(target.cfg, next.cfg); Object.assign(target.timer, next.timer);
}
export const state = clone(DEF);
export let lastBackup = null;
export const ready = (async () => {
  try { if (typeof indexedDB !== "undefined") db = await openDB(); }
  catch { setTimeout(() => report("pn:error", "IndexedDB unavailable; using local storage."), 0); }
  let raw = await getRaw(KEY);
  if (raw === null && db) {
    raw = localGet(KEY);
    if (raw !== null) {
      const migrated = await parseSaved(raw);
      assignState(state, migrate(migrated));
      await setRaw(KEY, JSON.stringify(state));
      raw = JSON.stringify(state);
    }
  }
  assignState(state, migrate(await parseSaved(raw)));
  const backups = await getRaw(BACKUPS);
  if (backups) {
    try { const saved = JSON.parse(backups); if (Array.isArray(saved)) { lastBackup = saved[0]?.at || null; snapshotTime = Date.parse(lastBackup) || 0; } }
    catch { setTimeout(() => report("pn:error", "Backup history was corrupt and could not be loaded."), 0); }
  }
  if (!snapshotTime) {
    const at = new Date().toISOString(), data = JSON.stringify(state);
    await setRaw(BACKUPS, JSON.stringify([{ at, data }]));
    snapshotTime = Date.now(); lastBackup = at;
  }
  if (raw === null) {
    const empty = JSON.stringify(state);
    await setRaw(KEY, empty);
  }
  return state;
})();
export async function reloadState() {
  await ready;
  const raw = await getRaw(KEY);
  const parsed = await parseSaved(raw);
  assignState(state, migrate(parsed));
  return state;
}
export async function flush() {
  await ready;
  const raw = JSON.stringify(migrate(state));
  await setRaw(KEY, raw);
  const now = Date.now();
  if (!snapshotTime || now - snapshotTime >= 60 * 60 * 1000) {
    const history = await getRaw(BACKUPS);
    let backups = [];
    if (history) {
      try { const parsed = JSON.parse(history); if (Array.isArray(parsed)) backups = parsed; }
      catch { backups = []; }
    }
    const at = new Date(now).toISOString();
    backups.unshift({ at, data: raw });
    await setRaw(BACKUPS, JSON.stringify(backups.slice(0, 5)));
    snapshotTime = now; lastBackup = at;
  }
  if (db) { try { localStorage.setItem(SYNC, String(now)); } catch {} }
  report("pn:saved", lastBackup);
}
let t;
export const save = () => { clearTimeout(t); t = setTimeout(() => flush().catch((error) => report("pn:error", error.message)), 250); };
if (typeof addEventListener === "function") addEventListener("pagehide", () => { flush().catch((error) => report("pn:error", error.message)); });

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
