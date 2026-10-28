import { $, esc } from "./lib.js";

export function initPalette({ S, T, go, getView, toggleTimer, notes, toggleTheme, openSettings, openHelp, flush, day, normalizeNotes, validateImport, toast }) {
  function exportData() {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
    anchor.download = `pomonote-${day()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }
  function importData() {
    const input = document.createElement("input"); input.type = "file"; input.accept = "application/json";
    input.onchange = async () => {
      try {
        if (!input.files?.[0]) return;
        const data = JSON.parse(await input.files[0].text()), result = validateImport(data);
        if (!result) throw new Error("Invalid export.");
        Object.assign(S, { tasks: result.tasks, notes: result.notes, sessions: result.sessions });
        normalizeNotes(S.notes); await flush();
        if (result.skipped) {
          toast(`Import complete; skipped ${result.skipped} invalid item${result.skipped === 1 ? "" : "s"}.`);
          setTimeout(() => location.reload(), 3500);
        } else location.reload();
      } catch (error) {
        toast(error.message === "Invalid export." ? "That file is not a pomonote export." : `Import failed: ${error.message}`);
      }
    };
    input.click();
  }
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("#install").hidden = false; });
  addEventListener("appinstalled", () => { deferred = null; $("#install").hidden = true; toast("Installed. Your data stays on this device."); });
  async function install() {
    if (!deferred) return toast("Use your browser menu: Install app, or Add to Home Screen.");
    deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true;
  }
  $("#install").onclick = install;
  const commands = () => [
    ["Go to Focus", () => go("focus")], ["Go to Tasks", () => go("tasks")], ["Go to Notes", () => go("notes")], ["Go to Stats", () => go("stats")],
    [T.running ? "Pause timer" : "Start timer", toggleTimer], ["New task", () => { go("tasks"); $("#q").focus(); }],
    ["New note", () => { go("notes"); notes.newNote(); }], ["Settings", openSettings], ["Keyboard shortcuts", openHelp],
    ["Toggle dark / light / auto", toggleTheme], ["Install app", install], ["Export data (JSON)", exportData], ["Import data (JSON)", importData]
  ];
  let selected = 0, visible = [];
  function drawPalette() {
    const query = $("#pi").value.toLowerCase();
    visible = commands().filter(([label]) => label.toLowerCase().includes(query));
    selected = Math.min(selected, Math.max(0, visible.length - 1));
    $("#pl").innerHTML = visible.map(([label], i) => `<li role="option" aria-selected="${i === selected}">${esc(label)}</li>`).join("");
  }
  const run = (index) => { $("#pal").close(); visible[index]?.[1](); };
  function openPalette() { $("#pi").value = ""; selected = 0; drawPalette(); $("#pal").showModal(); $("#pi").focus(); }
  $("#pi").oninput = () => { selected = 0; drawPalette(); };
  $("#pi").onkeydown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + visible.length) % (visible.length || 1); drawPalette();
    } else if (e.key === "Enter") run(selected);
  };
  $("#pl").onclick = (e) => run([...$("#pl").children].indexOf(e.target.closest("li")));
  $("#pal").onclick = (e) => e.target === $("#pal") && $("#pal").close();
  $("#kbd").onclick = openPalette;
  return {
    openPalette,
    exportData,
    importData,
    handleKeydown(e) {
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (mod && key === "k") { e.preventDefault(); return openPalette(); }
      if (mod && key === "e" && getView() === "notes") { e.preventDefault(); return notes.togglePreview(); }
      if (mod || e.altKey || e.target.closest("input,textarea,button,summary,dialog")) return;
      if (e.key === "?") openHelp();
      else if (e.code === "Space" && getView() === "focus") { e.preventDefault(); toggleTimer(); }
      else if (/^[1-4]$/.test(e.key)) go(["focus", "tasks", "notes", "stats"][+e.key - 1]);
    }
  };
}
