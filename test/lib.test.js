import assert from "node:assert/strict";
import test from "node:test";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};

const { addDays, day, md, normalize, parseTask, MAX_SUB } = await import("../public/lib.js");

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
