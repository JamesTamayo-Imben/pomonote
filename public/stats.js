import { $, esc } from "./lib.js";

const localInputTime = (timestamp) => {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
};
const localTimestamp = (value) => new Date(value).getTime();

export function initStats({ S, day, addDays, save, toast }) {
  let editing = null;
  function renderStats() {
    const today = day(), range = $("#stats-range").value || "week", length = range === "month" ? 30 : 7;
    const byDay = {}, byLabel = {}, byHour = {};
    for (const session of S.sessions) {
      const date = day(new Date(session.t));
      byDay[date] = (byDay[date] || 0) + session.min;
      const label = session.label || "(no label)";
      byLabel[label] = (byLabel[label] || 0) + session.min;
      const hour = new Date(session.t - session.min * 60000).getHours();
      byHour[hour] = (byHour[hour] || 0) + session.min;
    }
    const days = Array.from({ length }, (_, i) => addDays(today, i - length + 1));
    const max = Math.max(30, ...days.map((date) => byDay[date] || 0));
    const total = days.reduce((sum, date) => sum + (byDay[date] || 0), 0);
    $("#chart").setAttribute("aria-label", `Last ${length} days: ${total} minutes focused.`);
    let streak = 0;
    for (let date = byDay[today] ? today : addDays(today, -1); byDay[date]; date = addDays(date, -1)) streak++;
    const card = (label, value) => `<div class="card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    $("#cards").innerHTML = card("Today", `${Math.round(byDay[today] || 0)} min`)
      + card(range === "week" ? "Last 7 days" : "Last 30 days", `${Math.round(total)} min`)
      + card("Streak", `${streak} day${streak === 1 ? "" : "s"}`)
      + card("Tasks done", S.tasks.filter((task) => task.done).length);
    $("#chart").innerHTML = days.map((date, i) => `<div class="col" title="${esc(date)}: ${esc(byDay[date] || 0)} min"><i style="--i:${esc(i)};height:${esc(((byDay[date] || 0) / max) * 100)}%"></i><span>${esc(date.slice(8))}</span></div>`).join("");
    $("#chart-data caption").textContent = `Focus minutes for the last ${length} days`;
    $("#chart-data tbody").innerHTML = days.map((date) => `<tr><th scope="row">${esc(new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</th><td>${esc(byDay[date] || 0)} minutes</td></tr>`).join("");
    const heatDays = Array.from({ length: 84 }, (_, i) => addDays(today, i - 83));
    $("#heatmap").innerHTML = heatDays.map((date) => {
      const level = Math.min(4, Math.ceil((byDay[date] || 0) / 25));
      return `<span class="heatmap-cell" style="--level:${esc(level)}" title="${esc(date)}: ${esc(byDay[date] || 0)} min"></span>`;
    }).join("");
    const bestHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    $("#best-hour").textContent = bestHour
      ? `Best focus hour: ${new Date(2000, 0, 1, +bestHour[0]).toLocaleTimeString(undefined, { hour: "numeric" })} (${Math.round(bestHour[1])} min total)`
      : "Complete a focus session to discover your best focus hour.";
    $("#labels").innerHTML = Object.entries(byLabel).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([label, minutes]) => `<li class="row2"><span>${esc(label)}</span><b>${esc(Math.round(minutes))} min</b></li>`).join("")
      || `<li class="mut pad">Finish a focus session to see where your time goes.</li>`;
    const sessions = S.sessions.map((session, index) => ({ session, index })).sort((a, b) => b.session.t - a.session.t);
    $("#sessions").innerHTML = sessions.map(({ session, index }) => `<li class="session-row"><span>${esc(new Date(session.t).toLocaleString())}<br><small>${esc(session.label || "(no label)")} · ${esc(session.min)} min</small></span><button type="button" data-edit-session="${index}" aria-label="Edit session ${esc(session.label || "without label")}">Edit</button><button type="button" data-delete-session="${index}" aria-label="Delete session ${esc(session.label || "without label")}">×</button></li>`).join("")
      || `<li class="session-empty">No focus sessions yet.</li>`;
  }
  function fillSelect(select, items, selected, title) {
    select.replaceChildren(new Option("None", ""));
    for (const item of items) select.add(new Option(item.title || "Untitled", item.id, false, item.id === selected));
    select.setAttribute("aria-label", title);
  }
  function openEditor(index) {
    editing = index;
    const session = S.sessions[index];
    if (!session) return;
    $("#session-time").value = localInputTime(session.t);
    $("#session-min").value = session.min;
    $("#session-label").value = session.label || "";
    fillSelect($("#session-task"), S.tasks, session.task, "Session task");
    fillSelect($("#session-note"), S.notes, session.noteId, "Session note");
    $("#session-dialog").showModal();
  }
  $("#stats-range").onchange = renderStats;
  $("#sessions").onclick = (event) => {
    const edit = event.target.closest("[data-edit-session]");
    const remove = event.target.closest("[data-delete-session]");
    if (edit) openEditor(+edit.dataset.editSession);
    if (remove) {
      const index = +remove.dataset.deleteSession;
      if (index >= 0 && index < S.sessions.length) {
        S.sessions.splice(index, 1); save(); renderStats(); toast("Session deleted");
      }
    }
  };
  $("#session-edit").onsubmit = (event) => {
    event.preventDefault();
    const session = S.sessions[editing], timestamp = localTimestamp($("#session-time").value);
    const minutes = Number($("#session-min").value);
    if (!session || !Number.isFinite(timestamp) || !Number.isFinite(minutes) || minutes <= 0) {
      toast("Enter a valid session date and duration.");
      return;
    }
    session.t = timestamp; session.min = minutes;
    session.label = $("#session-label").value.trim();
    session.task = $("#session-task").value || null;
    session.noteId = $("#session-note").value || S.tasks.find((task) => task.id === session.task)?.noteId || null;
    save(); $("#session-dialog").close(); renderStats();
  };
  $("#session-delete").onclick = () => {
    if (editing === null || !S.sessions[editing]) return;
    S.sessions.splice(editing, 1); editing = null; save(); $("#session-dialog").close(); renderStats(); toast("Session deleted");
  };
  return { renderStats };
}
