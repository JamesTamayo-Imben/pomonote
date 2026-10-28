import { $, fmt } from "./lib.js";

export function initTimer({ S, T, C, day, save, toast, getView, renderStats }) {
  let ctx;
  const len = () => C[T.mode] * 60000;
  const left = () => (T.running ? T.endAt - Date.now() : T.left);
  const todays = () => S.sessions.filter((s) => day(new Date(s.t)) === day());
  function beep() {
    if (!C.sound) return;
    try {
      ctx ||= new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      o.start(); o.stop(ctx.currentTime + 0.7);
    } catch {}
  }
  const notify = (m) => { try { if (Notification.permission === "granted") new Notification(m); } catch {} };
  function drawTimer() {
    const ms = left();
    $("#clock").textContent = fmt(ms);
    $("#bar").style.transform = `scaleX(${1 - Math.max(0, ms) / len()})`;
    $("#go").textContent = T.running ? "> pause_" : "> start_";
    document.title = T.running ? `${fmt(ms)} · pomonote` : "pomonote";
    document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === T.mode)));
    const td = todays();
    $("#today").textContent = `Today: ${td.length} session${td.length === 1 ? "" : "s"} · ${td.reduce((a, s) => a + s.min, 0)} min focused`;
  }
  function setMode(m, start = false) {
    T.mode = m; T.len = len(); T.left = T.len; T.running = start; T.endAt = start ? Date.now() + T.left : 0;
    save(); drawTimer();
  }
  function toggle() {
    if (T.running) { T.left = T.endAt - Date.now(); T.running = false; }
    else {
      try { ctx ||= new AudioContext(); if (Notification.permission === "default") Notification.requestPermission(); } catch {}
      if (!T.endAt) T.len = T.left;
      T.endAt = Date.now() + T.left; T.running = true;
    }
    save(); drawTimer();
  }
  function finish() {
    const was = T.mode;
    if (Date.now() - T.endAt > 120000) {
      toast("Timer finished while you were away");
      $("#announcement").textContent = "Timer finished while you were away.";
      setMode("focus"); return;
    }
    $("#announcement").textContent = was === "focus" ? "Focus session complete." : "Break complete.";
    beep();
    if (was === "focus") {
      S.sessions.push({ t: Date.now(), min: T.len / 60000, label: T.label.trim(), task: T.task });
      const k = S.tasks.find((x) => x.id === T.task);
      if (k) k.spent = (k.spent || 0) + 1;
      if (getView() === "stats") renderStats();
    }
    notify(was === "focus" ? "Focus done. Take a break." : "Break over. Back to it.");
    setMode(was !== "focus" ? "focus" : todays().length % C.every === 0 ? "long" : "short", C.auto);
  }
  setInterval(() => (T.running && Date.now() >= T.endAt ? finish() : drawTimer()), 250);
  $("#go").onclick = toggle; $("#reset").onclick = () => setMode(T.mode);
  $("#skip").onclick = () => setMode(T.mode === "focus" ? "short" : "focus");
  $("#modes").onclick = (e) => e.target.dataset.m && setMode(e.target.dataset.m);
  $("#label").value = T.label;
  $("#label").oninput = (e) => { T.label = e.target.value; T.task = null; save(); };
  for (const k of ["focus", "short", "long", "every"]) {
    const el = $("#c-" + k); el.value = C[k];
    el.onchange = () => {
      C[k] = Math.min(180, Math.max(1, +el.value || C[k])); el.value = C[k];
      if (!T.running && k === T.mode) T.left = T.len = len();
      save(); drawTimer();
    };
  }
  for (const k of ["auto", "sound"]) {
    const el = $("#c-" + k); el.checked = C[k];
    el.onchange = () => { C[k] = el.checked; save(); };
  }
  return { drawTimer, toggle, setMode };
}
