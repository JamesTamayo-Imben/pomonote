import assert from "node:assert/strict";
import test from "node:test";

const localStore = new Map();
globalThis.localStorage = {
  getItem: (key) => localStore.get(key) ?? null,
  setItem: (key, value) => localStore.set(key, String(value))
};
globalThis.addEventListener = () => {};

const { addDays, day, md, normalize, parseTask, MAX_SUB, migrate, validateImport } = await import("../public/lib.js");

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

test("md escapes HTML and does not create javascript links", () => {
  assert.equal(md("<img src=x onerror=alert(1)>"), "<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  const link = md("[click](javascript:alert(1))");
  assert.doesNotMatch(link, /<a\b/i);
  assert.match(link, /javascript:/);
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

test("migrate adds the current schema and preserves existing user data", () => {
  const task = { id: "task-1", title: "Keep me" };
  const migrated = migrate({ tasks: [task], cfg: { theme: "light" } });
  assert.equal(migrated.version, 1);
  assert.deepEqual(migrated.tasks, [task]);
  assert.equal(migrated.cfg.theme, "light");
  assert.deepEqual(migrated.sessions, []);
});

test("legacy localStorage data is loaded and migrated without losing records", async () => {
  const task = { id: "legacy-task", title: "Keep task" };
  localStorage.setItem("pomonote.v2", JSON.stringify({ tasks: [task], notes: [], sessions: [] }));
  const legacy = await import("../public/lib.js?legacy-storage-test");
  await legacy.ready;
  assert.equal(legacy.state.version, 1);
  assert.deepEqual(legacy.state.tasks, [task]);
});

test("validateImport keeps valid records and counts invalid records", () => {
  const result = validateImport({
    tasks: [
      { id: "ok", title: "Valid", due: null, pri: 0, est: 2, spent: 1, list: "Work" },
      { id: 2, title: "Invalid", due: null, pri: 0, est: 0, spent: 0, list: "Work" }
    ],
    notes: [{ id: "n1", title: "Note", body: "Body" }, { id: "n2", title: "Broken" }],
    sessions: [{ t: 1, min: 25 }, { t: "today", min: 25 }]
  });
  assert.equal(result.tasks.length, 1);
  assert.equal(result.notes.length, 1);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.skipped, 3);
  assert.equal(validateImport({ tasks: [], notes: {}, sessions: [] }), null);
});
