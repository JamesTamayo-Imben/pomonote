import { $, esc } from "./lib.js";

export function initNotes({ S, uid, toast, save, md, MAX_SUB }) {
  const openSet = new Set();
  let current = null, preview = false;
  const byId = (id) => S.notes.find((n) => n.id === id);
  const note = () => byId(current);
  const kids = (parent) => S.notes.filter((n) => n.parent === parent);
  const words = (n) => (n.body.trim() ? n.body.trim().split(/\s+/).length : 0);
  const swap = (el) => { el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap"); };
  function renderNotes() {
    const query = $("#ns").value.trim().toLowerCase();
    const row = (n) => `<button class="nrow${current === n.id ? " on" : ""}" data-id="${esc(n.id)}">${n.pinned ? "★ " : ""}${esc(n.title || "Untitled")}</button>`;
    const root = (n) => {
      const children = kids(n.id), open = openSet.has(n.id);
      return `<li><div class="nr">${children.length ? `<button class="chev" data-t="${esc(n.id)}" aria-expanded="${open}" aria-label="Show or hide sub-notes">▸</button>` : `<span class="chev"></span>`}${row(n)}${children.length ? `<span class="cnt">${esc(children.length)}</span>` : ""}</div>`
        + (children.length ? `<div class="subs${open ? " open" : ""}"><ul>${children.map((k) => `<li>${row(k)}</li>`).join("")}</ul></div>` : "") + "</li>";
    };
    const list = (query ? S.notes.filter((n) => (n.title + " " + n.body).toLowerCase().includes(query)) : S.notes.filter((n) => !n.parent))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
    $("#ntree").innerHTML = list.map((n) => (query ? `<li>${row(n)}</li>` : root(n))).join("") || `<li class="mut pad">${query ? "No matches." : "No notes yet."}</li>`;
    const selected = note(); $("#ned").hidden = !selected; $("#nempty").hidden = !!selected;
    if (!selected) return;
    const parent = byId(selected.parent), children = kids(selected.id), full = children.length >= MAX_SUB;
    $("#npin").textContent = selected.pinned ? "Unpin" : "Pin";
    $("#nsub").disabled = !!parent || full;
    $("#nsub").title = parent ? "Sub-notes can't have sub-notes" : full ? `Limit reached (${MAX_SUB})` : "";
    $("#subbox").innerHTML = parent ? `<button class="sublink" data-id="${esc(parent.id)}">↑ Back to ${esc(parent.title || "Untitled")}</button>`
      : `<div class="subhead">Sub-notes ${esc(children.length)}/${MAX_SUB}</div>` + (children.length ? `<ul class="subl">${children.map((k) => `<li><button class="sublink" data-id="${esc(k.id)}">${esc(k.title || "Untitled")}<small>${esc(words(k))} words</small></button></li>`).join("")}</ul>`
        : `<p class="mut small">None yet. Use + Sub-note to add up to ${MAX_SUB}.</p>`);
  }
  function showPreview() {
    $("#npv").hidden = !preview; $("#nb").hidden = preview; $("#nprev").textContent = preview ? "Edit" : "Preview";
    if (preview) $("#npv").innerHTML = md($("#nb").value);
  }
  function openNote(id) {
    current = id; const selected = note();
    if (selected.parent) openSet.add(selected.parent);
    $("#nt").value = selected.title; $("#nb").value = selected.body; preview = false;
    $("#nstat").textContent = ""; showPreview(); renderNotes(); swap($("#ned"));
  }
  function newNote(parent = null) {
    if (parent) {
      if (byId(parent).parent) return toast("Sub-notes can't have sub-notes.");
      if (kids(parent).length >= MAX_SUB) return toast(`Limit reached: ${MAX_SUB} sub-notes per note.`);
      openSet.add(parent);
    }
    const selected = { id: uid(), parent, title: "", body: "", pinned: false, updated: Date.now() };
    S.notes.push(selected); save(); openNote(selected.id); $("#nt").focus();
  }
  function edit() {
    const selected = note(); if (!selected) return;
    const titleChanged = selected.title !== $("#nt").value;
    selected.title = $("#nt").value; selected.body = $("#nb").value; selected.updated = Date.now(); save();
    $("#nstat").textContent = `${words(selected)} words · saved`;
    if (titleChanged) renderNotes();
  }
  $("#nt").oninput = edit; $("#nb").oninput = edit; $("#ns").oninput = renderNotes;
  $("#npv").onclick = (e) => {
    const box = e.target.closest("input[data-check]"); if (!box) return;
    const lines = $("#nb").value.split("\n");
    const checks = lines.flatMap((line, index) => /^\s*(?:[-*]|\d+[.)])\s+\[[ xX]\]/.test(line) ? [index] : []);
    const line = checks[+box.dataset.check]; if (line === undefined) return;
    lines[line] = lines[line].replace(/\[([ xX])\]/, box.checked ? "[x]" : "[ ]");
    $("#nb").value = lines.join("\n"); edit(); showPreview();
  };
  $("#ntree").onclick = (e) => {
    const toggle = e.target.closest("[data-t]");
    if (toggle) {
      const open = !openSet.has(toggle.dataset.t);
      open ? openSet.add(toggle.dataset.t) : openSet.delete(toggle.dataset.t);
      toggle.setAttribute("aria-expanded", open); toggle.closest("li").querySelector(".subs")?.classList.toggle("open", open); return;
    }
    const button = e.target.closest("[data-id]"); if (button) openNote(button.dataset.id);
  };
  $("#subbox").onclick = (e) => { const button = e.target.closest("[data-id]"); if (button) openNote(button.dataset.id); };
  $("#nn").onclick = () => newNote(); $("#nsub").onclick = () => current && newNote(current);
  $("#npin").onclick = () => { const selected = note(); if (selected) { selected.pinned = !selected.pinned; save(); renderNotes(); } };
  $("#nprev").onclick = () => { preview = !preview; showPreview(); };
  $("#ndel").onclick = () => {
    const selected = note(); if (!selected) return;
    const ids = new Set([selected.id, ...kids(selected.id).map((k) => k.id)]);
    if (!confirm(`Delete "${selected.title || "Untitled"}"${ids.size > 1 ? ` and ${ids.size - 1} sub-note(s)` : ""}? This cannot be undone.`)) return;
    S.notes = S.notes.filter((x) => !ids.has(x.id)); save(); current = null;
    selected.parent ? openNote(selected.parent) : renderNotes();
  };
  return {
    renderNotes, openNote, newNote, showPreview, togglePreview: () => { preview = !preview; showPreview(); },
    getCurrent: () => current, isPreview: () => preview, clearCurrent: () => { current = null; }
  };
}
