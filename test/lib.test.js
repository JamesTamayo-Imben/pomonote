import assert from "node:assert/strict";
import test from "node:test";

const localStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStore.get(key) ?? null,
  setItem: (key, value) => localStore.set(key, String(value))
};
globalThis.addEventListener = () => {};

const { addDays, day, md, normalize, parseTask, nextRecurringDate, MAX_SUB, migrate, validateImport } = await import("../public/lib.js");

test("parseTask handles tokens with punctuation and relative dates", () => {
  const task = parseTask("Review #work, !2 ~3");
  assert.equal(task.title, "Review");
  assert.equal(task.list, "work");
  assert.equal(task.pri, 2);
  assert.equal(task.est, 3);

  assert.equal(parseTask("mon").title, "mon");
  assert.equal(parseTask("mon").due, null);
  assert.equal(parseTask("Ship monday").due !== null, true);

  const nextMonday = (1 - new Date(day() + "T12:00:00").getDay() + 7) % 7 || 7;
  assert.equal(parseTask("Plan next week").due, addDays(day(), nextMonday));
  assert.equal(parseTask("Plan in 3 days").due, addDays(day(), 3));
});

test("parseTask supports recurring rules in quick-add", () => {
  const monday = parseTask("Review report every mon.");
  assert.equal(monday.title, "Review report");
  assert.equal(monday.repeat, "weekly");
  assert.equal(monday.repeatDay, 1);
  assert.equal(parseTask("Water plants every day").repeat, "daily");
  assert.equal(parseTask("Team sync every weekdays").repeat, "weekdays");
  assert.equal(parseTask("Pay rent every month").repeat, "monthly");
});

test("nextRecurringDate advances daily, weekday, weekly, and month-end tasks", () => {
  assert.equal(nextRecurringDate({ repeat: "daily", due: "2025-03-10" }, "2025-03-10"), "2025-03-11");
  assert.equal(nextRecurringDate({ repeat: "weekdays", due: "2025-03-07" }, "2025-03-07"), "2025-03-10");
  assert.equal(nextRecurringDate({ repeat: "weekly", due: "2025-03-10", repeatDay: 1 }, "2025-03-10"), "2025-03-17");
  assert.equal(nextRecurringDate({ repeat: "monthly", due: "2025-01-31" }, "2025-01-31"), "2025-02-28");
});

test("md escapes HTML and does not create javascript links", () => {
  assert.equal(md("<img src=x onerror=alert(1)>"), "<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  const link = md("[click](javascript:alert(1))");
  assert.doesNotMatch(link, /<a\b/i);
  assert.match(link, /javascript:/);
});

test("md renders ordered and nested lists with interactive checklist markers", () => {
  const html = md("1. One\n  - [ ] Subtask\n  - [x] Done\n2. Two");
  assert.match(html, /^<ol><li>One<ul><li><input[^>]*data-check="0"[^>]*> Subtask<\/li><li><input[^>]*data-check="1"[^>]*checked> Done<\/li><\/ul><\/li><li>Two<\/li><\/ol>$/);
});

test("normalize prevents nested sub-notes and repairs missing parents", () => {
  const notes = [
    { id: "root", parent: null },
    { id: "child", parent: "root" },
    { id: "grandchild", parent: "child" },
    { id: "orphan", parent: "missing" }
  ];
  normalize(notes);
  assert.equal(notes.find((n) => n.id === "grandchild").parent, "root");
  assert.equal(notes.find((n) => n.id === "orphan").parent, null);
});

test("normalize limits each note to ten sub-notes", () => {
  const notes = [{ id: "root", parent: null }, ...Array.from({ length: MAX_SUB + 1 }, (_, i) => ({ id: `child-${i}`, parent: "root" }))];
  normalize(notes);
  assert.equal(notes.filter((n) => n.parent === "root").length, MAX_SUB);
  assert.equal(notes.at(-1).parent, null);
});

test("migrate upgrades the current schema and preserves existing user data", () => {
  const task = { id: "task-1", title: "Keep me" };
  const migrated = migrate({ tasks: [task], cfg: { theme: "light" } });
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.tasks, [{ ...task, repeat: null, repeatDay: null, noteId: null, recurrenceFrom: null }]);
  assert.equal(migrated.cfg.theme, "light");
  assert.equal(migrated.cfg.soundType, "beep");
  assert.equal(migrated.cfg.volume, 50);
  assert.deepEqual(migrated.sessions, []);
});

test("legacy localStorage data is loaded and migrated without losing records", async () => {
  const task = { id: "legacy-task", title: "Keep task" };
  localStorage.setItem("pomonote.v2", JSON.stringify({ tasks: [task], notes: [], sessions: [] }));
  const legacy = await import("../public/lib.js?legacy-storage-test");
  await legacy.ready;
  assert.equal(legacy.state.version, 2);
  assert.deepEqual(legacy.state.tasks, [{ ...task, repeat: null, repeatDay: null, noteId: null, recurrenceFrom: null }]);
  assert.equal(JSON.parse(localStorage.getItem("pomonote.v2")).version, 2);
});

test("validateImport keeps valid records and counts invalid records", () => {
  const result = validateImport({
    tasks: [
      { id: "ok", title: "Valid", due: null, pri: 0, est: 2, spent: 1, list: "Work", repeat: "weekly", repeatDay: 1, noteId: "n1" },
      { id: "bad-repeat", title: "Invalid repeat", due: null, pri: 0, est: 0, spent: 0, list: "Work", repeat: "yearly" },
      { id: 2, title: "Invalid", due: null, pri: 0, est: 0, spent: 0, list: "Work" }
    ],
    notes: [{ id: "n1", title: "Note", body: "Body" }, { id: "n2", title: "Broken" }],
    sessions: [{ t: 1, min: 25, noteId: "n1" }, { t: "today", min: 25 }]
  });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.notes.length, 1);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.skipped, 4);
  assert.equal(validateImport({ tasks: [], notes: {}, sessions: [] }), null);
});
