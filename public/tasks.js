import { $, esc, nextRecurringDate } from "./lib.js";

export function initTasks({ S, T, go, toast, save, uid, day, addDays, parseTask }) {
  let filter = "today", fresh = null, editing = null;
  const rel = (d) => (d === day() ? "Today" : d === addDays(day(), 1) ? "Tomorrow" : new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
  function renderTasks() {
    const today = day(), week = addDays(today, 7);
    document.querySelectorAll("#tfilter button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
    const rows = S.tasks.filter((x) => (filter === "done" ? x.done : !x.done && (filter === "all" || (filter === "inbox" ? !x.due : filter === "today" ? x.due && x.due <= today : x.due > today && x.due <= week))))
      .sort((a, b) => (a.due || "9").localeCompare(b.due || "9") || (a.pri || 4) - (b.pri || 4));
    $("#tlist").innerHTML = rows.map((x) => {
      const focused = S.sessions.filter((session) => session.task === x.id).reduce((sum, session) => sum + session.min, 0);
      const note = S.notes.find((item) => item.id === x.noteId);
      return `<li class="task${x.done ? " done" : ""}${x.id === fresh ? " enter" : ""}" data-id="${esc(x.id)}"><input type="checkbox" ${x.done ? "checked" : ""} aria-label="Complete task: ${esc(x.title)}">
      ${x.id === editing ? `<input class="edit-title" value="${esc(x.title)}" aria-label="Rename task: ${esc(x.title)}">` : `<span class="tt" title="Tap to rename">${esc(x.title)}</span>`}<span class="meta">${x.pri ? `<b class="p${esc(x.pri)}">P${esc(x.pri)}</b>` : ""}${x.due ? `<span class="${x.due < today && !x.done ? "late" : ""}">${esc(rel(x.due))}</span>` : ""}<span>#${esc(x.list)}</span>${x.est ? `<span>${esc(x.spent || 0)}/${esc(x.est)} sessions</span>` : ""}${focused ? `<span>${esc(Math.round(focused))} min</span>` : ""}${note ? `<span title="Linked note">${esc(note.title || "Untitled")}</span>` : ""}${x.repeat ? `<span title="Recurring task">↻ ${esc(x.repeat)}</span>` : ""}</span>
      <button class="task-details" aria-label="Edit details for ${esc(x.title)}">⋯</button><button class="fb" aria-label="Focus on task: ${esc(x.title)}">▶</button><button class="del" aria-label="Delete task: ${esc(x.title)}">×</button></li>`;
    }).join("")
      || `<li class="mut pad">Nothing here. Try “Review draft tomorrow !1 ~2”.</li>`;
    fresh = null;
  }
  const taskOf = (e) => S.tasks.find((k) => k.id === e.target.closest("li[data-id]")?.dataset.id);
  function editDetails(task) {
    $("#task-dialog-title").textContent = `Task details: ${task.title}`;
    $("#detail-due").value = task.due || ""; $("#detail-pri").value = String(task.pri || 0);
    $("#detail-list").value = task.list || "Inbox"; $("#detail-est").value = String(task.est || 0);
    $("#detail-repeat").value = task.repeat || "";
    $("#detail-repeat-day").value = Number.isInteger(task.repeatDay) ? String(task.repeatDay) : "";
    $("#detail-repeat-day").disabled = task.repeat !== "weekly";
    $("#detail-note").replaceChildren(new Option("None", ""));
    for (const note of S.notes) $("#detail-note").add(new Option(note.title || "Untitled", note.id, false, note.id === task.noteId));
    $("#task-dialog").showModal();
    $("#detail-repeat").onchange = () => { $("#detail-repeat-day").disabled = $("#detail-repeat").value !== "weekly"; };
    $("#task-details").onsubmit = (e) => {
      e.preventDefault(); task.due = $("#detail-due").value || null; task.pri = +$("#detail-pri").value;
      task.list = $("#detail-list").value.trim() || "Inbox";
      task.est = Math.max(0, Math.min(20, Math.trunc(+$("#detail-est").value || 0)));
      task.repeat = $("#detail-repeat").value || null;
      task.repeatDay = task.repeat === "weekly" && $("#detail-repeat-day").value !== "" ? +$("#detail-repeat-day").value : null;
      task.noteId = $("#detail-note").value || null;
      save(); $("#task-dialog").close(); renderTasks();
    };
  }
  $("#tfilter").onclick = (e) => { if (e.target.dataset.f) { filter = e.target.dataset.f; renderTasks(); } };
  $("#tlist").onclick = (e) => {
    const task = taskOf(e), row = e.target.closest("li"); if (!task) return;
    if (e.target.closest(".tt")) {
      editing = task.id; renderTasks(); const input = $("#tlist .edit-title"); input.focus(); input.select();
    } else if (e.target.matches('input[type="checkbox"]')) {
      task.done = e.target.checked ? Date.now() : 0; save(); row.classList.toggle("done", !!task.done);
      if (task.done && task.repeat) {
        const hasNext = S.tasks.some((item) => item.recurrenceFrom === task.id && !item.done);
        if (!hasNext) {
          S.tasks.push({ ...task, id: uid(), due: nextRecurringDate(task, day()), done: 0, spent: 0, created: Date.now(), recurrenceFrom: task.id });
          save();
        }
      }
      if (filter !== "all") row.classList.add("leave"); setTimeout(renderTasks, 260);
    } else if (e.target.closest(".del")) {
      const index = S.tasks.indexOf(task); S.tasks.splice(index, 1); save(); row.classList.add("leave"); setTimeout(renderTasks, 260);
      toast("Task deleted", () => { S.tasks.splice(Math.min(index, S.tasks.length), 0, task); save(); renderTasks(); });
    } else if (e.target.closest(".task-details")) editDetails(task);
    else if (e.target.closest(".fb")) { T.task = task.id; T.noteId = task.noteId || null; T.label = task.title; $("#label").value = task.title; save(); go("focus"); }
  };
  $("#tlist").onkeydown = (e) => {
    if (!e.target.matches(".edit-title")) return;
    const task = taskOf(e);
    if (e.key === "Enter") { e.preventDefault(); if (task) task.title = e.target.value.trim().slice(0, 200) || task.title; editing = null; save(); renderTasks(); }
    else if (e.key === "Escape") { editing = null; renderTasks(); }
  };
  $("#add").onsubmit = (e) => {
    e.preventDefault(); const raw = $("#q").value.trim(); if (!raw) return;
    fresh = uid(); S.tasks.push({ id: fresh, noteId: null, recurrenceFrom: null, done: 0, spent: 0, created: Date.now(), ...parseTask(raw) });
    $("#q").value = ""; save(); renderTasks();
  };
  $("#task-cancel").onclick = () => $("#task-dialog").close();
  return { renderTasks };
}
