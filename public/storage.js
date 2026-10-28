import { $, reloadState } from "./lib.js";

export function initStorage({ S, getLastBackup, normalizeNotes, applyTheme, getView, notes, drawTimer, renderers, toast }) {
  const backupStatus = () => {
    const lastBackup = getLastBackup();
    return `Last backup: ${lastBackup ? new Date(lastBackup).toLocaleString() : "not yet"}`;
  };
  $("#backup-status").textContent = backupStatus();
  $("#settings-backup").textContent = backupStatus();
  document.addEventListener("pn:error", (e) => toast(e.detail));
  document.addEventListener("pn:saved", () => {
    $("#backup-status").textContent = backupStatus();
    $("#settings-backup").textContent = backupStatus();
  });
  addEventListener("storage", (e) => {
    if (e.key !== "pomonote.v2" && e.key !== "pomonote.v2.sync") return;
    const editingNote = $("#nt").matches(":focus") || $("#nb").matches(":focus");
    reloadState().then(() => {
      normalizeNotes(S.notes); applyTheme();
      $("#label").value = S.timer.label;
      for (const key of ["focus", "short", "long", "every"]) $("#c-" + key).value = S.cfg[key];
      for (const key of ["auto", "sound"]) $("#c-" + key).checked = S.cfg[key];
      $("#theme-choice").value = S.cfg.theme;
      const selected = getView() === "notes" && S.notes.find((n) => n.id === notes.getCurrent());
      if (getView() === "notes" && selected && !editingNote) {
        $("#nt").value = selected.title; $("#nb").value = selected.body;
        if (notes.isPreview()) notes.showPreview();
      } else if (getView() === "notes" && !selected) notes.clearCurrent();
      drawTimer();
      renderers[getView()]?.();
    }).catch((error) => toast(error.message));
  });
}
