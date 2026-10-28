import { $, esc } from "./lib.js";

export function renderStats({ S, day, addDays }) {
  const today = day(), byDay = {}, byLabel = {};
  for (const session of S.sessions) {
    const date = day(new Date(session.t));
    byDay[date] = (byDay[date] || 0) + session.min;
    const label = session.label || "(no label)";
    byLabel[label] = (byLabel[label] || 0) + session.min;
  }
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const max = Math.max(30, ...days.map((date) => byDay[date] || 0));
  const total = days.reduce((sum, date) => sum + (byDay[date] || 0), 0);
  $("#chart").setAttribute("aria-label", `Last 14 days: ${total} minutes focused.`);
  let streak = 0;
  for (let date = byDay[today] ? today : addDays(today, -1); byDay[date]; date = addDays(date, -1)) streak++;
  const card = (label, value) => `<div class="card"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  $("#cards").innerHTML = card("Today", (byDay[today] || 0) + " min")
    + card("Last 7 days", days.slice(7).reduce((sum, date) => sum + (byDay[date] || 0), 0) + " min")
    + card("Streak", `${streak} day${streak === 1 ? "" : "s"}`)
    + card("Tasks done", S.tasks.filter((task) => task.done).length);
  $("#chart").innerHTML = days.map((date, i) => `<div class="col" title="${esc(date)}: ${esc(byDay[date] || 0)} min"><i style="--i:${esc(i)};height:${esc(((byDay[date] || 0) / max) * 100)}%"></i><span>${esc(date.slice(8))}</span></div>`).join("");
  $("#chart-data tbody").innerHTML = days.map((date) => `<tr><th scope="row">${esc(new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</th><td>${esc(byDay[date] || 0)} minutes</td></tr>`).join("");
  $("#labels").innerHTML = Object.entries(byLabel).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, minutes]) => `<li class="row2"><span>${esc(label)}</span><b>${esc(minutes)} min</b></li>`).join("")
    || `<li class="mut pad">Finish a focus session to see where your time goes.</li>`;
}
