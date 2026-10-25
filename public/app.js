import { $, uid, day, addDays, fmt, esc, state as S, save, flush, parseTask, md } from "./lib.js";
const T = S.timer, C = S.cfg, views = ["focus", "tasks", "notes", "stats"];
let view = "focus";
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3500); };
document.addEventListener("pn:error", (e) => toast(e.detail));

// ---------------------------------------------------------------- shell ---
function go(v) {
  view = views.includes(v) ? v : "focus";
  for (const x of views) $("#v-" + x).hidden = x !== view;
  document.querySelectorAll("#nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.v === view)));
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  ({ tasks: renderTasks, notes: renderNotes, stats: renderStats })[view]?.();
}
const applyTheme = () => (document.documentElement.dataset.theme = C.theme === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : C.theme);
const toggleTheme = () => { C.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyTheme(); save(); };

// ---------------------------------------------------------------- timer ---
let ctx;
const len = () => C[T.mode] * 60000, left = () => (T.running ? T.endAt - Date.now() : T.left);
const todays = () => S.sessions.filter((s) => day(new Date(s.t)) === day());
function beep() { if (!C.sound) return; try { ctx ||= new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
  o.frequency.value = 880; g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7); o.start(); o.stop(ctx.currentTime + 0.7); } catch {} }
const notify = (m) => { try { if (Notification.permission === "granted") new Notification(m); } catch {} };
function drawTimer() {
  const ms = left();
  $("#clock").textContent = fmt(ms); $("#bar").style.transform = `scaleX(${1 - Math.max(0, ms) / len()})`;
  $("#go").textContent = T.running ? "> pause_" : "> start_";
  document.title = T.running ? `${fmt(ms)} · pomonote` : "pomonote";
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === T.mode)));
  const td = todays(); $("#today").textContent = `Today: ${td.length} session${td.length === 1 ? "" : "s"} · ${td.reduce((a, s) => a + s.min, 0)} min focused`;
}
function setMode(m, start = false) { T.mode = m; T.left = len(); T.running = start; T.endAt = start ? Date.now() + T.left : 0; save(); drawTimer(); }
function toggle() {
  if (T.running) { T.left = T.endAt - Date.now(); T.running = false; }
  else { try { ctx ||= new AudioContext(); if (Notification.permission === "default") Notification.requestPermission(); } catch {} T.endAt = Date.now() + T.left; T.running = true; }
  save(); drawTimer();
}
function finish() {
  beep(); const was = T.mode;
  if (was === "focus") { S.sessions.push({ t: Date.now(), min: C.focus, label: T.label.trim(), task: T.task });
    const k = S.tasks.find((x) => x.id === T.task); if (k) k.spent = (k.spent || 0) + 1; }
  notify(was === "focus" ? "Focus done. Take a break." : "Break over. Back to it.");
  setMode(was !== "focus" ? "focus" : todays().length % C.every === 0 ? "long" : "short", C.auto);
}
setInterval(() => (T.running && Date.now() >= T.endAt ? finish() : drawTimer()), 250); // timestamp-based: survives throttled tabs and reloads
$("#go").onclick = toggle; $("#reset").onclick = () => setMode(T.mode); $("#skip").onclick = () => setMode(T.mode === "focus" ? "short" : "focus");
$("#modes").onclick = (e) => e.target.dataset.m && setMode(e.target.dataset.m);
$("#label").value = T.label; $("#label").oninput = (e) => { T.label = e.target.value; T.task = null; save(); };
for (const k of ["focus", "short", "long", "every"]) { const el = $("#c-" + k); el.value = C[k];
  el.onchange = () => { C[k] = Math.min(180, Math.max(1, +el.value || C[k])); el.value = C[k]; if (!T.running && k === T.mode) T.left = len(); save(); drawTimer(); }; }
for (const k of ["auto", "sound"]) { const el = $("#c-" + k); el.checked = C[k]; el.onchange = () => { C[k] = el.checked; save(); }; }

// ---------------------------------------------------------------- tasks ---
let tf = "today", fresh = null;
const rel = (d) => (d === day() ? "Today" : d === addDays(day(), 1) ? "Tomorrow" : d);
function renderTasks() {
  const t = day(), w = addDays(t, 7);
  document.querySelectorAll("#tfilter button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === tf)));
  const rows = S.tasks.filter((x) => (tf === "done" ? x.done : !x.done && (tf === "all" || (tf === "inbox" ? !x.due : tf === "today" ? x.due && x.due <= t : x.due > t && x.due <= w))))
    .sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.pri || 4) - (b.pri || 4));
  $("#tlist").innerHTML = rows.map((x) => `<li class="task${x.done ? " done" : ""}${x.id === fresh ? " enter" : ""}" data-id="${x.id}"><input type="checkbox" ${x.done ? "checked" : ""} aria-label="Complete task">
    <span class="tt" title="Double-click to rename">${esc(x.title)}</span><span class="meta">${x.pri ? `<b class="p${x.pri}">P${x.pri}</b>` : ""}${x.due ? `<span class="${x.due < t && !x.done ? "late" : ""}">${rel(x.due)}</span>` : ""}<span>#${esc(x.list)}</span>${x.est ? `<span>${x.spent || 0}/${x.est}</span>` : ""}</span>
    <button class="fb" aria-label="Focus on this task">▶</button><button class="del" aria-label="Delete task">×</button></li>`).join("")
    || `<li class="mut pad">Nothing here. Try “Review draft tomorrow !1 ~2”.</li>`;
  fresh = null;
}
const taskOf = (e) => S.tasks.find((k) => k.id === e.target.closest("li[data-id]")?.dataset.id);
$("#tfilter").onclick = (e) => { if (e.target.dataset.f) { tf = e.target.dataset.f; renderTasks(); } };
$("#tlist").onclick = (e) => { const x = taskOf(e), li = e.target.closest("li"); if (!x) return;
  if (e.target.matches("input")) { x.done = e.target.checked ? Date.now() : 0; save(); li.classList.toggle("done", !!x.done); if (tf !== "all") li.classList.add("leave"); setTimeout(renderTasks, 260); }
  else if (e.target.closest(".del")) { S.tasks = S.tasks.filter((k) => k !== x); save(); li.classList.add("leave"); setTimeout(renderTasks, 260); toast("Task deleted"); }
  else if (e.target.closest(".fb")) { T.task = x.id; T.label = x.title; $("#label").value = x.title; save(); go("focus"); } };
$("#tlist").ondblclick = (e) => { const x = taskOf(e); const v = x && e.target.closest(".tt") && prompt("Rename task", x.title); if (v?.trim()) { x.title = v.trim().slice(0, 200); save(); renderTasks(); } };
$("#add").onsubmit = (e) => { e.preventDefault(); const raw = $("#q").value.trim(); if (!raw) return;
  fresh = uid(); S.tasks.push({ id: fresh, done: 0, spent: 0, created: Date.now(), ...parseTask(raw) }); $("#q").value = ""; save(); renderTasks(); };

// ---------------------------------------------------------------- notes ---
const MAX_SUB = 10, openSet = new Set();
let cur = null, prev = false;
const byId = (id) => S.notes.find((n) => n.id === id), note = () => byId(cur), kids = (p) => S.notes.filter((n) => n.parent === p);
const words = (n) => (n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
const swap = (el) => { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); };
// rules: a sub-note cannot have sub-notes, and a note holds at most MAX_SUB sub-notes (also repairs old/imported data)
function normalize() {
  for (const n of S.notes) { const p = byId(n.parent); if (!p) n.parent = null; else if (p.parent) n.parent = p.parent; }
  for (const r of S.notes.filter((n) => !n.parent)) kids(r.id).slice(MAX_SUB).forEach((k) => (k.parent = null));
}
function renderNotes() {
  const q = $("#ns").value.trim().toLowerCase();
  const row = (n) => `<button class="nrow${cur === n.id ? " on" : ""}" data-id="${n.id}">${n.pinned ? "★ " : ""}${esc(n.title || "Untitled")}</button>`;
  const root = (n) => { const c = kids(n.id), o = openSet.has(n.id);
    return `<li><div class="nr">${c.length ? `<button class="chev" data-t="${n.id}" aria-expanded="${o}" aria-label="Show or hide sub-notes">▸</button>` : `<span class="chev"></span>`}${row(n)}${c.length ? `<span class="cnt">${c.length}</span>` : ""}</div>`
      + (c.length ? `<div class="subs${o ? " open" : ""}"><ul>${c.map((k) => `<li>${row(k)}</li>`).join("")}</ul></div>` : "") + "</li>"; };
  const list = (q ? S.notes.filter((n) => (n.title + " " + n.body).toLowerCase().includes(q)) : S.notes.filter((n) => !n.parent)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
  $("#ntree").innerHTML = list.map((n) => (q ? `<li>${row(n)}</li>` : root(n))).join("") || `<li class="mut pad">${q ? "No matches." : "No notes yet."}</li>`;
  const n = note(); $("#ned").hidden = !n; $("#nempty").hidden = !!n;
  if (!n) return;
  const p = byId(n.parent), c = kids(n.id), full = c.length >= MAX_SUB;
  $("#npin").textContent = n.pinned ? "Unpin" : "Pin";
  $("#nsub").disabled = !!p || full; $("#nsub").title = p ? "Sub-notes can't have sub-notes" : full ? `Limit reached (${MAX_SUB})` : "";
  $("#subbox").innerHTML = p ? `<button class="sublink" data-id="${p.id}">↑ Back to ${esc(p.title || "Untitled")}</button>`
    : `<div class="subhead">Sub-notes ${c.length}/${MAX_SUB}</div>` + (c.length ? `<ul class="subl">${c.map((k) => `<li><button class="sublink" data-id="${k.id}">${esc(k.title || "Untitled")}<small>${words(k)} words</small></button></li>`).join("")}</ul>`
      : `<p class="mut small">None yet. Use + Sub-note to add up to ${MAX_SUB}.</p>`);
}
function showPrev() { $("#npv").hidden = !prev; $("#nb").hidden = prev; $("#nprev").textContent = prev ? "Edit" : "Preview"; if (prev) $("#npv").innerHTML = md($("#nb").value); }
function openNote(id) { cur = id; const n = note(); if (n.parent) openSet.add(n.parent); $("#nt").value = n.title; $("#nb").value = n.body; prev = false; $("#nstat").textContent = ""; showPrev(); renderNotes(); swap($("#ned")); }
function newNote(parent = null) {
  if (parent) { if (byId(parent).parent) return toast("Sub-notes can't have sub-notes."); if (kids(parent).length >= MAX_SUB) return toast(`Limit reached: ${MAX_SUB} sub-notes per note.`); openSet.add(parent); }
  const n = { id: uid(), parent, title: "", body: "", pinned: false, updated: Date.now() }; S.notes.push(n); save(); openNote(n.id); $("#nt").focus();
}
const edit = () => { const n = note(); if (!n) return; n.title = $("#nt").value; n.body = $("#nb").value; n.updated = Date.now(); save(); $("#nstat").textContent = `${words(n)} words · saved`; renderNotes(); };
$("#nt").oninput = edit; $("#nb").oninput = edit; $("#ns").oninput = renderNotes;
$("#ntree").onclick = (e) => { const t = e.target.closest("[data-t]");
  if (t) { const o = !openSet.has(t.dataset.t); o ? openSet.add(t.dataset.t) : openSet.delete(t.dataset.t); t.setAttribute("aria-expanded", o); t.closest("li").querySelector(".subs")?.classList.toggle("open", o); return; }
  const b = e.target.closest("[data-id]"); if (b) openNote(b.dataset.id); };
$("#subbox").onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) openNote(b.dataset.id); };
$("#nn").onclick = () => newNote(); $("#nsub").onclick = () => cur && newNote(cur);
$("#npin").onclick = () => { const n = note(); if (n) { n.pinned = !n.pinned; save(); renderNotes(); } };
$("#nprev").onclick = () => { prev = !prev; showPrev(); };
$("#ndel").onclick = () => { const n = note(); if (!n) return; const ids = new Set([n.id, ...kids(n.id).map((k) => k.id)]);
  if (!confirm(`Delete "${n.title || "Untitled"}"${ids.size > 1 ? ` and ${ids.size - 1} sub-note(s)` : ""}? This cannot be undone.`)) return;
  S.notes = S.notes.filter((x) => !ids.has(x.id)); save(); cur = null; n.parent ? openNote(n.parent) : renderNotes(); };

// ---------------------------------------------------------------- stats ---
function renderStats() {
  const t = day(), by = {}, lb = {};
  for (const s of S.sessions) { const d = day(new Date(s.t)); by[d] = (by[d] || 0) + s.min; const k = s.label || "(no label)"; lb[k] = (lb[k] || 0) + s.min; }
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13)), max = Math.max(30, ...days.map((d) => by[d] || 0));
  let streak = 0; for (let d = by[t] ? t : addDays(t, -1); by[d]; d = addDays(d, -1)) streak++;
  const card = (k, v) => `<div class="card"><span>${k}</span><b>${v}</b></div>`;
  $("#cards").innerHTML = card("Today", (by[t] || 0) + " min") + card("Last 7 days", days.slice(7).reduce((a, d) => a + (by[d] || 0), 0) + " min")
    + card("Streak", `${streak} day${streak === 1 ? "" : "s"}`) + card("Tasks done", S.tasks.filter((x) => x.done).length);
  $("#chart").innerHTML = days.map((d, i) => `<div class="col" title="${d}: ${by[d] || 0} min"><i style="--i:${i};height:${((by[d] || 0) / max) * 100}%"></i><span>${d.slice(8)}</span></div>`).join("");
  $("#labels").innerHTML = Object.entries(lb).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `<li class="row2"><span>${esc(k)}</span><b>${v} min</b></li>`).join("")
    || `<li class="mut pad">Finish a focus session to see where your time goes.</li>`;
}

// ------------------------------------------------- data ownership + palette ---
function exportData() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" })); a.download = `pomonote-${day()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function importData() { const i = document.createElement("input"); i.type = "file"; i.accept = "application/json";
  i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); if (!Array.isArray(d.tasks) || !Array.isArray(d.notes)) throw 0;
    Object.assign(S, { tasks: d.tasks, notes: d.notes, sessions: Array.isArray(d.sessions) ? d.sessions : [] }); normalize(); flush(); location.reload(); } catch { toast("That file is not a pomonote export."); } }; i.click(); }
let deferred = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("#install").hidden = false; });
addEventListener("appinstalled", () => { deferred = null; $("#install").hidden = true; toast("Installed. Your data stays on this device."); });
async function install() { if (!deferred) return toast("Use your browser menu: Install app, or Add to Home Screen."); deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; }
$("#install").onclick = install;
const cmds = () => [["Go to Focus", () => go("focus")], ["Go to Tasks", () => go("tasks")], ["Go to Notes", () => go("notes")], ["Go to Stats", () => go("stats")],
  [T.running ? "Pause timer" : "Start timer", toggle], ["New task", () => { go("tasks"); $("#q").focus(); }], ["New note", () => { go("notes"); newNote(); }],
  ["Toggle light / dark", toggleTheme], ["Install app", install], ["Export data (JSON)", exportData], ["Import data (JSON)", importData]];
let sel = 0, shown = [];
function drawPal() { const q = $("#pi").value.toLowerCase(); shown = cmds().filter(([n]) => n.toLowerCase().includes(q)); sel = Math.min(sel, Math.max(0, shown.length - 1));
  $("#pl").innerHTML = shown.map(([n], i) => `<li${i === sel ? ' aria-selected="true"' : ""}>${esc(n)}</li>`).join(""); }
const run = (i) => { $("#pal").close(); shown[i]?.[1](); };
const openPal = () => { $("#pi").value = ""; sel = 0; drawPal(); $("#pal").showModal(); $("#pi").focus(); };
$("#pi").oninput = () => { sel = 0; drawPal(); };
$("#pi").onkeydown = (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % (shown.length || 1); drawPal(); } else if (e.key === "Enter") run(sel); };
$("#pl").onclick = (e) => run([...$("#pl").children].indexOf(e.target.closest("li")));
$("#pal").onclick = (e) => e.target === $("#pal") && $("#pal").close();
$("#kbd").onclick = openPal;
addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === "k") { e.preventDefault(); return openPal(); }
  if (mod && k === "e" && view === "notes") { e.preventDefault(); prev = !prev; return showPrev(); }
  if (mod || e.altKey || e.target.closest("input,textarea,button,summary,dialog")) return;
  if (e.code === "Space" && view === "focus") { e.preventDefault(); toggle(); } else if (/^[1-4]$/.test(e.key)) go(views[+e.key - 1]);
});
$("#nav").onclick = (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
addEventListener("hashchange", () => go(location.hash.slice(1)));

normalize(); navigator.storage?.persist?.(); applyTheme(); drawTimer(); go(location.hash.slice(1));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
