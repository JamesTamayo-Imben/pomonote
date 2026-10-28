import { $, uid, day, addDays, state as S, save, flush, ready, parseTask, md, normalize as normalizeNotes, MAX_SUB, validateImport, lastBackup } from "./lib.js";
import { initTimer } from "./timer.js";
import { initTasks } from "./tasks.js";
import { initNotes } from "./notes.js";
import { renderStats as renderStatsView } from "./stats.js";
import { initPalette } from "./palette.js";
import { initStorage } from "./storage.js";

await ready;
if (!S.onboarded) {
  S.tasks.push({ id: uid(), title: "Plan your first focus session", due: day(), list: "Inbox", pri: 0, est: 1, spent: 0, done: 0, created: Date.now() });
  S.notes.push({ id: uid(), parent: null, title: "Welcome to pomonote", body: "Use the timer to focus, add tasks with `#list` and `!priority`, and write notes here.", pinned: false, updated: Date.now() });
  S.onboarded = true; save();
}

const T = S.timer, C = S.cfg, views = ["focus", "tasks", "notes", "stats"];
let view = "focus";
const toast = (message, action, actionLabel = "Undo", duration = action ? 5000 : 3500) => {
  const element = $("#toast"); element.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "toast-action"; button.textContent = actionLabel;
    button.onclick = () => { clearTimeout(toast.timer); element.hidden = true; action(); };
    element.append(" ", button);
  }
  element.hidden = false; clearTimeout(toast.timer);
  if (duration) toast.timer = setTimeout(() => (element.hidden = true), duration);
};
const renderStats = () => renderStatsView({ S, day, addDays });
const timer = initTimer({ S, T, C, day, save, toast, getView: () => view, renderStats });
const tasks = initTasks({ S, T, go, toast, save, uid, day, addDays, parseTask });
const notes = initNotes({ S, uid, toast, save, md, MAX_SUB });
const renderers = { tasks: tasks.renderTasks, notes: notes.renderNotes, stats: renderStats };
function go(target) {
  view = views.includes(target) ? target : "focus";
  for (const section of views) $("#v-" + section).hidden = section !== view;
  document.querySelectorAll("#nav button, #bottom-nav [data-v]").forEach((button) => button.setAttribute("aria-current", String(button.dataset.v === view)));
  if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  renderers[view]?.();
}

const themePreference = matchMedia("(prefers-color-scheme: light)");
function applyTheme() {
  const light = C.theme === "auto" ? themePreference.matches : C.theme === "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  $('meta[name="theme-color"]').content = light ? "#f6f3ec" : "#0d0c0a";
  $("#theme-choice").value = C.theme;
}
const toggleTheme = () => { C.theme = C.theme === "dark" ? "light" : C.theme === "light" ? "auto" : "dark"; applyTheme(); save(); };
$("#theme-choice").onchange = () => { C.theme = $("#theme-choice").value; applyTheme(); save(); };
themePreference.addEventListener("change", () => { if (C.theme === "auto") applyTheme(); });

function openSettings() {
  $("#theme-choice").value = C.theme;
  $("#settings-backup").textContent = `Last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : "not yet"}`;
  $("#settings-dialog").showModal();
}
const openHelp = () => $("#help-dialog").showModal();
$("#settings-open").onclick = openSettings; $("#mobile-settings").onclick = openSettings;
$("#settings-export").onclick = () => { $("#settings-dialog").close(); palette.exportData(); };
$("#settings-import").onclick = () => { $("#settings-dialog").close(); palette.importData(); };
$("#nav").onclick = (e) => { const button = e.target.closest("button"); if (button) go(button.dataset.v); };
$("#bottom-nav").onclick = (e) => {
  const button = e.target.closest("button");
  if (button?.dataset.v) go(button.dataset.v);
  else if (button?.id === "mobile-settings") openSettings();
};
addEventListener("hashchange", () => go(location.hash.slice(1)));

const palette = initPalette({ S, T, go, getView: () => view, toggleTimer: timer.toggle, notes, toggleTheme, openSettings, openHelp, save, flush, day, normalizeNotes, validateImport, toast });
addEventListener("keydown", (e) => palette.handleKeydown(e));
initStorage({ S, getLastBackup: () => lastBackup, normalizeNotes, applyTheme, getView: () => view, notes, drawTimer: timer.drawTimer, renderers, toast });

normalizeNotes(S.notes); navigator.storage?.persist?.(); applyTheme(); timer.drawTimer(); go(location.hash.slice(1));
if ("serviceWorker" in navigator) {
  let reloading = false, prompted = false, reloadForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadForUpdate || reloading) return;
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register("./sw.js").then((registration) => {
    const offerUpdate = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller || prompted) return;
      prompted = true;
      const waiting = registration.waiting;
      toast("Update available, reload", () => { reloadForUpdate = true; waiting.postMessage({ type: "SKIP_WAITING" }); }, "Reload", 0);
    };
    offerUpdate();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed") offerUpdate(); });
    });
  }).catch((error) => toast(`Offline support could not start: ${error.message}`));
}
