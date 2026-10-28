import { $, uid, day, addDays, fmt, esc, state as S, save, flush, ready, reloadState, parseTask, md, normalize as normalizeNotes, MAX_SUB, validateImport, lastBackup } from "./lib.js";
await ready;
if (!S.onboarded) {
  S.tasks.push({ id: uid(), title: "Plan your first focus session", due: day(), list: "Inbox", pri: 0, est: 1, spent: 0, done: 0, created: Date.now() });
  S.notes.push({ id: uid(), parent: null, title: "Welcome to pomonote", body: "Use the timer to focus, add tasks with `#list` and `!priority`, and write notes here.", pinned: false, updated: Date.now() });
  S.onboarded = true; save();
}
const T = S.timer, C = S.cfg, views = ["focus", "tasks", "notes", "stats"];
let view = "focus";
const toast = (m, action, actionLabel = "Undo") => {
  const t = $("#toast"); t.replaceChildren(document.createTextNode(m));
  if (action) { const b = document.createElement("button"); b.type = "button"; b.className = "toast-action"; b.textContent = actionLabel;
    b.onclick = () => { clearTimeout(toast.h); t.hidden = true; action(); }; t.append(" ", b); }
  t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), action ? 5000 : 3500);
};
document.addEventListener("pn:error", (e) => toast(e.detail));
addEventListener("storage", (e) => {
  if (e.key !== "pomonote.v2" && e.key !== "pomonote.v2.sync") return;
  const editingNote = $("#nt").matches(":focus") || $("#nb").matches(":focus");
  reloadState().then(() => {
    normalizeNotes(S.notes); applyTheme();
    $("#label").value = T.label;
    for (const k of ["focus", "short", "long", "every"]) $("#c-" + k).value = C[k];
    for (const k of ["auto", "sound"]) $("#c-" + k).checked = C[k];
    $("#theme-choice").value = C.theme;
    const n = view === "notes" && S.notes.find((x) => x.id === cur);
    if (view === "notes" && n && !editingNote) { $("#nt").value = n.title; $("#nb").value = n.body; if (prev) showPrev(); }
    else if (view === "notes" && !n) cur = null;
    drawTimer();
    ({ tasks: renderTasks, notes: renderNotes, stats: renderStats })[view]?.();
  }).catch((error) => toast(error.message));
});
document.addEventListener("pn:saved", () => {
  const date = lastBackup ? new Date(lastBackup).toLocaleString() : "not yet";
  $("#backup-status").textContent = `Last backup: ${date}`;
  $("#settings-backup").textContent = `Last backup: ${date}`;
});

// ---------------------------------------------------------------- shell ---
function go(v) {
  view = views.includes(v) ? v : "focus";
  for (const x of views) $("#v-" + x).hidden = x !== view;
  document.querySelectorAll("#nav button, #bottom-nav [data-v]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.v === view)));
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  ({ tasks: renderTasks, notes: renderNotes, stats: renderStats })[view]?.();
}
const themePreference = matchMedia("(prefers-color-scheme: light)");
const applyTheme = () => {
  const light = C.theme === "auto" ? themePreference.matches : C.theme === "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  $('meta[name="theme-color"]').content = light ? "#f6f3ec" : "#0d0c0a";
  $("#theme-choice").value = C.theme;
};
const toggleTheme = () => { C.theme = C.theme === "dark" ? "light" : C.theme === "light" ? "auto" : "dark"; applyTheme(); save(); };
$("#theme-choice").onchange = () => { C.theme = $("#theme-choice").value; applyTheme(); save(); };
themePreference.addEventListener("change", () => { if (C.theme === "auto") applyTheme(); });

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
function setMode(m, start = false) { T.mode = m; T.len = len(); T.left = T.len; T.running = start; T.endAt = start ? Date.now() + T.left : 0; save(); drawTimer(); }
function toggle() {
  if (T.running) { T.left = T.endAt - Date.now(); T.running = false; }
  else { try { ctx ||= new AudioContext(); if (Notification.permission === "default") Notification.requestPermission(); } catch {} if (!T.endAt) T.len = T.left; T.endAt = Date.now() + T.left; T.running = true; }
  save(); drawTimer();
}
function finish() {
  const was = T.mode;
  if (Date.now() - T.endAt > 120000) { toast("Timer finished while you were away"); $("#announcement").textContent = "Timer finished while you were away."; setMode("focus"); return; }
  $("#announcement").textContent = was === "focus" ? "Focus session complete." : "Break complete.";
  beep();
  if (was === "focus") { S.sessions.push({ t: Date.now(), min: T.len / 60000, label: T.label.trim(), task: T.task });
    const k = S.tasks.find((x) => x.id === T.task); if (k) k.spent = (k.spent || 0) + 1;
    if (view === "stats") renderStats(); }
  notify(was === "focus" ? "Focus done. Take a break." : "Break over. Back to it.");
  setMode(was !== "focus" ? "focus" : todays().length % C.every === 0 ? "long" : "short", C.auto);
}
setInterval(() => (T.running && Date.now() >= T.endAt ? finish() : drawTimer()), 250); // timestamp-based: survives throttled tabs and reloads
$("#go").onclick = toggle; $("#reset").onclick = () => setMode(T.mode); $("#skip").onclick = () => setMode(T.mode === "focus" ? "short" : "focus");
$("#modes").onclick = (e) => e.target.dataset.m && setMode(e.target.dataset.m);
$("#label").value = T.label; $("#label").oninput = (e) => { T.label = e.target.value; T.task = null; save(); };
for (const k of ["focus", "short", "long", "every"]) { const el = $("#c-" + k); el.value = C[k];
  el.onchange = () => { C[k] = Math.min(180, Math.max(1, +el.value || C[k])); el.value = C[k]; if (!T.running && k === T.mode) T.left = T.len = len(); save(); drawTimer(); }; }
for (const k of ["auto", "sound"]) { const el = $("#c-" + k); el.checked = C[k]; el.onchange = () => { C[k] = el.checked; save(); }; }
$("#backup-status").textContent = `Last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : "not yet"}`;
$("#settings-backup").textContent = $("#backup-status").textContent;

// ---------------------------------------------------------------- tasks ---
let tf = "today", fresh = null, editing = null;
const rel = (d) => (d === day() ? "Today" : d === addDays(day(), 1) ? "Tomorrow" : new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
function renderTasks() {
  const t = day(), w = addDays(t, 7);
  document.querySelectorAll("#tfilter button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === tf)));
  const rows = S.tasks.filter((x) => (tf === "done" ? x.done : !x.done && (tf === "all" || (tf === "inbox" ? !x.due : tf === "today" ? x.due && x.due <= t : x.due > t && x.due <= w))))
    .sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.pri || 4) - (b.pri || 4));
  $("#tlist").innerHTML = rows.map((x) => `<li class="task${x.done ? " done" : ""}${x.id === fresh ? " enter" : ""}" data-id="${esc(x.id)}"><input type="checkbox" ${x.done ? "checked" : ""} aria-label="Complete task: ${esc(x.title)}">
    ${x.id === editing ? `<input class="edit-title" value="${esc(x.title)}" aria-label="Rename task: ${esc(x.title)}">` : `<span class="tt" title="Tap to rename">${esc(x.title)}</span>`}<span class="meta">${x.pri ? `<b class="p${esc(x.pri)}">P${esc(x.pri)}</b>` : ""}${x.due ? `<span class="${x.due < t && !x.done ? "late" : ""}">${esc(rel(x.due))}</span>` : ""}<span>#${esc(x.list)}</span>${x.est ? `<span>${esc(x.spent || 0)}/${esc(x.est)}</span>` : ""}</span>
  <button class="task-details" aria-label="Edit details for ${esc(x.title)}">⋯</button><button class="fb" aria-label="Focus on task: ${esc(x.title)}">▶</button><button class="del" aria-label="Delete task: ${esc(x.title)}">×</button></li>`).join("")
    || `<li class="mut pad">Nothing here. Try “Review draft tomorrow !1 ~2”.</li>`;
  fresh = null;
}
const taskOf = (e) => S.tasks.find((k) => k.id === e.target.closest("li[data-id]")?.dataset.id);
function editTaskDetails(task) {
  $("#task-dialog-title").textContent = `Task details: ${task.title}`;
  $("#detail-due").value = task.due || "";
  $("#detail-pri").value = String(task.pri || 0);
  $("#detail-list").value = task.list || "Inbox";
  $("#detail-est").value = String(task.est || 0);
  $("#task-dialog").showModal();
  $("#task-details").onsubmit = (e) => {
    e.preventDefault();
    task.due = $("#detail-due").value || null;
    task.pri = +$("#detail-pri").value;
    task.list = $("#detail-list").value.trim() || "Inbox";
    task.est = Math.max(0, Math.min(20, Math.trunc(+$("#detail-est").value || 0)));
    save(); $("#task-dialog").close(); renderTasks();
  };
}
$("#tfilter").onclick = (e) => { if (e.target.dataset.f) { tf = e.target.dataset.f; renderTasks(); } };
$("#tlist").onclick = (e) => { const x = taskOf(e), li = e.target.closest("li"); if (!x) return;
  if (e.target.closest(".tt")) { editing = x.id; renderTasks(); const input = $("#tlist .edit-title"); input.focus(); input.select(); }
  else if (e.target.matches('input[type="checkbox"]')) { x.done = e.target.checked ? Date.now() : 0; save(); li.classList.toggle("done", !!x.done); if (tf !== "all") li.classList.add("leave"); setTimeout(renderTasks, 260); }
  else if (e.target.closest(".del")) { const index = S.tasks.indexOf(x); S.tasks.splice(index, 1); save(); li.classList.add("leave"); setTimeout(renderTasks, 260);
    toast("Task deleted", () => { S.tasks.splice(Math.min(index, S.tasks.length), 0, x); save(); renderTasks(); }); }
  else if (e.target.closest(".task-details")) editTaskDetails(x);
  else if (e.target.closest(".fb")) { T.task = x.id; T.label = x.title; $("#label").value = x.title; save(); go("focus"); } };
$("#tlist").onkeydown = (e) => { if (!e.target.matches(".edit-title")) return;
  const x = taskOf(e); if (e.key === "Enter") { e.preventDefault(); if (x) x.title = e.target.value.trim().slice(0, 200) || x.title; editing = null; save(); renderTasks(); }
  else if (e.key === "Escape") { editing = null; renderTasks(); } };
$("#add").onsubmit = (e) => { e.preventDefault(); const raw = $("#q").value.trim(); if (!raw) return;
  fresh = uid(); S.tasks.push({ id: fresh, done: 0, spent: 0, created: Date.now(), ...parseTask(raw) }); $("#q").value = ""; save(); renderTasks(); };

// ---------------------------------------------------------------- notes ---
const openSet = new Set();
let cur = null, prev = false;
const byId = (id) => S.notes.find((n) => n.id === id), note = () => byId(cur), kids = (p) => S.notes.filter((n) => n.parent === p);
const words = (n) => (n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
const swap = (el) => { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); };
function renderNotes() {
  const q = $("#ns").value.trim().toLowerCase();
  const row = (n) => `<button class="nrow${cur === n.id ? " on" : ""}" data-id="${esc(n.id)}">${n.pinned ? "★ " : ""}${esc(n.title || "Untitled")}</button>`;
  const root = (n) => { const c = kids(n.id), o = openSet.has(n.id);
    return `<li><div class="nr">${c.length ? `<button class="chev" data-t="${esc(n.id)}" aria-expanded="${o}" aria-label="Show or hide sub-notes">▸</button>` : `<span class="chev"></span>`}${row(n)}${c.length ? `<span class="cnt">${esc(c.length)}</span>` : ""}</div>`
      + (c.length ? `<div class="subs${o ? " open" : ""}"><ul>${c.map((k) => `<li>${row(k)}</li>`).join("")}</ul></div>` : "") + "</li>"; };
  const list = (q ? S.notes.filter((n) => (n.title + " " + n.body).toLowerCase().includes(q)) : S.notes.filter((n) => !n.parent)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
  $("#ntree").innerHTML = list.map((n) => (q ? `<li>${row(n)}</li>` : root(n))).join("") || `<li class="mut pad">${q ? "No matches." : "No notes yet."}</li>`;
  const n = note(); $("#ned").hidden = !n; $("#nempty").hidden = !!n;
  if (!n) return;
  const p = byId(n.parent), c = kids(n.id), full = c.length >= MAX_SUB;
  $("#npin").textContent = n.pinned ? "Unpin" : "Pin";
  $("#nsub").disabled = !!p || full; $("#nsub").title = p ? "Sub-notes can't have sub-notes" : full ? `Limit reached (${MAX_SUB})` : "";
  $("#subbox").innerHTML = p ? `<button class="sublink" data-id="${esc(p.id)}">↑ Back to ${esc(p.title || "Untitled")}</button>`
    : `<div class="subhead">Sub-notes ${esc(c.length)}/${MAX_SUB}</div>` + (c.length ? `<ul class="subl">${c.map((k) => `<li><button class="sublink" data-id="${esc(k.id)}">${esc(k.title || "Untitled")}<small>${esc(words(k))} words</small></button></li>`).join("")}</ul>`
      : `<p class="mut small">None yet. Use + Sub-note to add up to ${MAX_SUB}.</p>`);
}
function showPrev() { $("#npv").hidden = !prev; $("#nb").hidden = prev; $("#nprev").textContent = prev ? "Edit" : "Preview"; if (prev) $("#npv").innerHTML = md($("#nb").value); }
function openNote(id) { cur = id; const n = note(); if (n.parent) openSet.add(n.parent); $("#nt").value = n.title; $("#nb").value = n.body; prev = false; $("#nstat").textContent = ""; showPrev(); renderNotes(); swap($("#ned")); }
function newNote(parent = null) {
  if (parent) { if (byId(parent).parent) return toast("Sub-notes can't have sub-notes."); if (kids(parent).length >= MAX_SUB) return toast(`Limit reached: ${MAX_SUB} sub-notes per note.`); openSet.add(parent); }
  const n = { id: uid(), parent, title: "", body: "", pinned: false, updated: Date.now() }; S.notes.push(n); save(); openNote(n.id); $("#nt").focus();
}
const edit = () => {
  const n = note(); if (!n) return;
  const titleChanged = n.title !== $("#nt").value;
  n.title = $("#nt").value; n.body = $("#nb").value; n.updated = Date.now(); save();
  $("#nstat").textContent = `${words(n)} words · saved`;
  if (titleChanged) renderNotes();
};
$("#nt").oninput = edit; $("#nb").oninput = edit; $("#ns").oninput = renderNotes;
$("#npv").onclick = (e) => {
  const box = e.target.closest("input[data-check]"); if (!box) return;
  const lines = $("#nb").value.split("\n");
  const checks = lines.flatMap((line, index) => /^\s*(?:[-*]|\d+[.)])\s+\[[ xX]\]/.test(line) ? [index] : []);
  const line = checks[+box.dataset.check]; if (line === undefined) return;
  lines[line] = lines[line].replace(/\[([ xX])\]/, box.checked ? "[x]" : "[ ]");
  $("#nb").value = lines.join("\n"); edit(); showPrev();
};
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
  const total = days.reduce((sum, d) => sum + (by[d] || 0), 0);
  $("#chart").setAttribute("aria-label", `Last 14 days: ${total} minutes focused.`);
  let streak = 0; for (let d = by[t] ? t : addDays(t, -1); by[d]; d = addDays(d, -1)) streak++;
  const card = (k, v) => `<div class="card"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  $("#cards").innerHTML = card("Today", (by[t] || 0) + " min") + card("Last 7 days", days.slice(7).reduce((a, d) => a + (by[d] || 0), 0) + " min")
    + card("Streak", `${streak} day${streak === 1 ? "" : "s"}`) + card("Tasks done", S.tasks.filter((x) => x.done).length);
  $("#chart").innerHTML = days.map((d, i) => `<div class="col" title="${esc(d)}: ${esc(by[d] || 0)} min"><i style="--i:${esc(i)};height:${esc(((by[d] || 0) / max) * 100)}%"></i><span>${esc(d.slice(8))}</span></div>`).join("");
  $("#chart-data tbody").innerHTML = days.map((d) => `<tr><th scope="row">${esc(new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</th><td>${esc(by[d] || 0)} minutes</td></tr>`).join("");
  $("#labels").innerHTML = Object.entries(lb).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `<li class="row2"><span>${esc(k)}</span><b>${esc(v)} min</b></li>`).join("")
    || `<li class="mut pad">Finish a focus session to see where your time goes.</li>`;
}

// ------------------------------------------------- data ownership + palette ---
function exportData() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" })); a.download = `pomonote-${day()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function importData() { const i = document.createElement("input"); i.type = "file"; i.accept = "application/json";
  i.onchange = async () => { try { if (!i.files?.[0]) return; const d = JSON.parse(await i.files[0].text()), result = validateImport(d); if (!result) throw new Error("Invalid export.");
    Object.assign(S, { tasks: result.tasks, notes: result.notes, sessions: result.sessions }); normalizeNotes(S.notes); await flush();
    const { skipped } = result;
    if (skipped) { toast(`Import complete; skipped ${skipped} invalid item${skipped === 1 ? "" : "s"}.`); setTimeout(() => location.reload(), 3500); }
    else location.reload(); } catch (error) { toast(error.message === "Invalid export." ? "That file is not a pomonote export." : `Import failed: ${error.message}`); } }; i.click(); }
function openSettings() {
  $("#theme-choice").value = C.theme;
  $("#settings-backup").textContent = `Last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : "not yet"}`;
  $("#settings-dialog").showModal();
}
$("#settings-open").onclick = openSettings;
$("#mobile-settings").onclick = openSettings;
$("#settings-export").onclick = () => { $("#settings-dialog").close(); exportData(); };
$("#settings-import").onclick = () => { $("#settings-dialog").close(); importData(); };
$("#task-cancel").onclick = () => $("#task-dialog").close();
const openHelp = () => $("#help-dialog").showModal();
let deferred = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("#install").hidden = false; });
addEventListener("appinstalled", () => { deferred = null; $("#install").hidden = true; toast("Installed. Your data stays on this device."); });
async function install() { if (!deferred) return toast("Use your browser menu: Install app, or Add to Home Screen."); deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; }
$("#install").onclick = install;
const cmds = () => [["Go to Focus", () => go("focus")], ["Go to Tasks", () => go("tasks")], ["Go to Notes", () => go("notes")], ["Go to Stats", () => go("stats")],
  [T.running ? "Pause timer" : "Start timer", toggle], ["New task", () => { go("tasks"); $("#q").focus(); }], ["New note", () => { go("notes"); newNote(); }],
  ["Settings", openSettings], ["Keyboard shortcuts", openHelp], ["Toggle dark / light / auto", toggleTheme], ["Install app", install],
  ["Export data (JSON)", exportData], ["Import data (JSON)", importData]];
let sel = 0, shown = [];
function drawPal() { const q = $("#pi").value.toLowerCase(); shown = cmds().filter(([n]) => n.toLowerCase().includes(q)); sel = Math.min(sel, Math.max(0, shown.length - 1));
  $("#pl").innerHTML = shown.map(([n], i) => `<li role="option" aria-selected="${i === sel}">${esc(n)}</li>`).join(""); }
const run = (i) => { $("#pal").close(); shown[i]?.[1](); };
const openPal = () => { $("#pi").value = ""; sel = 0; drawPal(); $("#pal").showModal(); $("#pi").focus(); };
$("#pi").oninput = () => { sel = 0; drawPal(); };
$("#pi").onkeydown = (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % (shown.length || 1); drawPal(); } else if (e.key === "Enter") run(sel); };
$("#pl").onclick = (e) => run([...$("#pl").children].indexOf(e.target.closest("li")));
$("#pal").onclick = (e) => e.target === $("#pal") && $("#pal").close();
$("#kbd").onclick = openPal;
$("#nav").onclick = (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.v); };
$("#bottom-nav").onclick = (e) => { const b = e.target.closest("button"); if (b?.dataset.v) go(b.dataset.v); };
addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === "k") { e.preventDefault(); return openPal(); }
  if (mod && k === "e" && view === "notes") { e.preventDefault(); prev = !prev; return showPrev(); }
  if (mod || e.altKey || e.target.closest("input,textarea,button,summary,dialog")) return;
  if (e.key === "?") openHelp();
  else if (e.code === "Space" && view === "focus") { e.preventDefault(); toggle(); } else if (/^[1-4]$/.test(e.key)) go(views[+e.key - 1]);
});
addEventListener("hashchange", () => go(location.hash.slice(1)));

normalizeNotes(S.notes); navigator.storage?.persist?.(); applyTheme(); drawTimer(); go(location.hash.slice(1));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
