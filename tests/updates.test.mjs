import test from "node:test";
import assert from "node:assert/strict";
import { isNewer, parseVersion, startUpdateChecks, updatesOf } from "../desktop/updates.mjs";

test("versions are release dates", () => {
  assert.deepEqual(parseVersion("v.26.11.01"), [26, 11, 1]);
  assert.deepEqual(parseVersion("v26.11.1"), [26, 11, 1]);
  assert.equal(parseVersion("26.11.1-rc.1"), null);
  assert.equal(parseVersion("latest"), null);
  assert.equal(isNewer("v26.11.10", "26.11.9"), true);
  assert.equal(isNewer("v26.12.1", "26.11.30"), true);
  assert.equal(isNewer("v.26.11.01", "26.11.1"), false);
  assert.equal(isNewer("v26.10.31", "26.11.1"), false);
  assert.equal(isNewer("nonsense", "26.11.1"), false);
});

test("the repository to check comes only from the app's own field", () => {
  assert.deepEqual(updatesOf({ edukors: { updates: "mgarlabx/edukors_slides_editor" } }), { owner: "mgarlabx", repo: "edukors_slides_editor" });
  assert.equal(updatesOf({ repository: { url: "https://github.com/mgarlabx/edukors_common_ux.git" } }), null);
  assert.equal(updatesOf({ edukors: { updates: "https://github.com/a/b" } }), null);
  assert.equal(updatesOf({ edukors: { updates: "a/b/c" } }), null);
  assert.equal(updatesOf({}), null);
});

test("update check: newer, older, drafts, foreign links, failures, and only once per version", async () => {
  const replies = [];
  const fetch = async (url) => { assert.equal(url, "https://api.github.com/repos/o/r/releases/latest"); const next = replies.shift(); if (next instanceof Error) throw next; return next; };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const told = [], logs = [];
  const checks = startUpdateChecks({ current: "26.11.1", owner: "o", repo: "r", fetch, notify: (u) => told.push(u), log: (m) => logs.push(m), delayMs: 1e9, everyMs: 1e9 });
  try {
    replies.push(ok({ tag_name: "v26.11.1", html_url: "https://github.com/o/r/releases/tag/v26.11.1" })); await checks.check();
    replies.push(ok({ tag_name: "v26.12.1", html_url: "https://github.com/o/r/releases/tag/v26.12.1", draft: true })); await checks.check();
    replies.push(ok({ tag_name: "v26.12.1", html_url: "https://evil.example/r" })); await checks.check();
    replies.push({ ok: false, status: 404 }); await checks.check();
    replies.push(new Error("offline")); await checks.check();
    assert.deepEqual(told, []);
    replies.push(ok({ tag_name: "v26.12.1", html_url: "https://github.com/o/r/releases/tag/v26.12.1" })); await checks.check();
    replies.push(ok({ tag_name: "v26.12.1", html_url: "https://github.com/o/r/releases/tag/v26.12.1" })); await checks.check();
    assert.deepEqual(told, [{ version: "26.12.1", url: "https://github.com/o/r/releases/tag/v26.12.1" }]);
    assert.equal(logs.length, 2);
  } finally { checks.stop(); }
});
