// The small part of the vitest API that the AI runtime tests use, on top of node:test and
// node:assert. The tests were written for vitest in edukors_ai_cli; this keeps them unchanged
// while Common runs everything with `node --test` and no test dependency.
import assert from "node:assert/strict";
import * as nodeTest from "node:test";

const TIMEOUT = 20_000;

const matcher = (test, label) => ({ __matcher: true, test, label });
const isMatcher = (value) => value !== null && typeof value === "object" && value.__matcher === true;

function equals(actual, expected) {
  if (isMatcher(expected)) return expected.test(actual);
  try {
    assert.deepStrictEqual(actual, expected);
    return true;
  } catch {
    if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => equals(actual[i], e));
    if (expected && typeof expected === "object" && actual && typeof actual === "object" && !Array.isArray(actual)) {
      const keys = new Set([...Object.keys(expected), ...Object.keys(actual)].filter((k) => expected[k] !== undefined || actual[k] !== undefined));
      return [...keys].every((k) => equals(actual[k], expected[k]));
    }
    return false;
  }
}

function matches(actual, expected) {
  if (isMatcher(expected)) return expected.test(actual);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matches(actual[i], e));
  if (expected && typeof expected === "object" && !(expected instanceof RegExp) && !(expected instanceof Date)) {
    if (actual === null || (typeof actual !== "object" && typeof actual !== "function")) return false;
    return Object.keys(expected).every((k) => matches(actual[k], expected[k]));
  }
  return equals(actual, expected);
}

const show = (value) => {
  try {
    return JSON.stringify(value, (_k, v) => (isMatcher(v) ? v.label : v));
  } catch {
    return String(value);
  }
};

function checks(actual, negate) {
  const ok = (pass, message) => {
    if (pass === negate) throw new assert.AssertionError({ message: `${negate ? "not " : ""}${message}`, actual, stackStartFn: ok });
  };
  return {
    toBe: (e) => ok(Object.is(actual, e), `expected ${show(actual)} to be ${show(e)}`),
    toEqual: (e) => ok(equals(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
    toMatchObject: (e) => ok(matches(actual, e), `expected ${show(actual)} to match ${show(e)}`),
    toContain: (e) => ok(typeof actual === "string" ? actual.includes(e) : [...actual].some((a) => Object.is(a, e)), `expected ${show(actual)} to contain ${show(e)}`),
    toHaveLength: (n) => ok(actual?.length === n, `expected length ${actual?.length} to be ${n}`),
    toHaveProperty: (k) => ok(actual != null && k in Object(actual), `expected ${show(actual)} to have property ${k}`),
    toBeNull: () => ok(actual === null, `expected ${show(actual)} to be null`),
    toBeLessThan: (n) => ok(actual < n, `expected ${show(actual)} to be less than ${n}`),
    toBeGreaterThan: (n) => ok(actual > n, `expected ${show(actual)} to be greater than ${n}`),
    toBeUndefined: () => ok(actual === undefined, `expected ${show(actual)} to be undefined`),
    toBeDefined: () => ok(actual !== undefined, `expected value to be defined`),
    toBeTruthy: () => ok(Boolean(actual), `expected ${show(actual)} to be truthy`),
    toMatch: (re) => ok(typeof re === "string" ? String(actual).includes(re) : re.test(String(actual)), `expected ${show(actual)} to match ${re}`),
    toThrow: (e) => {
      let thrown;
      try {
        actual();
      } catch (error) {
        thrown = error ?? new Error("thrown");
      }
      ok(Boolean(thrown) && throwMatches(thrown, e), `expected function to throw ${e ?? ""}`);
    },
  };
}

function throwMatches(error, expected) {
  if (expected === undefined) return true;
  if (typeof expected === "string") return String(error?.message).includes(expected);
  if (expected instanceof RegExp) return expected.test(String(error?.message));
  if (typeof expected === "function") return error instanceof expected;
  return matches(error, expected);
}

export function expect(actual) {
  const api = checks(actual, false);
  api.not = checks(actual, true);
  api.rejects = new Proxy({}, {
    get: (_t, name) => async (...args) => {
      let error;
      try {
        await actual;
      } catch (e) {
        error = e ?? new Error("rejected");
      }
      if (!error) throw new assert.AssertionError({ message: "expected promise to reject" });
      if (name === "toThrow") {
        if (!throwMatches(error, args[0])) throw new assert.AssertionError({ message: `rejection ${show(error?.message)} does not match ${show(args[0])}` });
        return;
      }
      checks(error, false)[name](...args);
    },
  });
  api.resolves = new Proxy({}, { get: (_t, name) => async (...args) => checks(await actual, false)[name](...args) });
  return api;
}

expect.any = (type) => matcher((v) => v != null && (Object(v) instanceof type || (type === Number && typeof v === "number") || (type === String && typeof v === "string") || (type === Boolean && typeof v === "boolean")), `Any<${type.name}>`);
expect.objectContaining = (e) => matcher((v) => matches(v, e), `ObjectContaining ${show(e)}`);
expect.arrayContaining = (e) => matcher((v) => Array.isArray(v) && e.every((x) => v.some((a) => matches(a, x))), `ArrayContaining ${show(e)}`);
expect.stringContaining = (e) => matcher((v) => typeof v === "string" && v.includes(e), `StringContaining ${e}`);

const wrap = (fn) => (fn ? () => fn() : undefined);
export function it(name, fn, timeout = TIMEOUT) {
  return nodeTest.it(name, { timeout }, wrap(fn));
}
it.runIf = (condition) => (name, fn, timeout) => (condition ? it(name, fn, timeout) : nodeTest.it(name, { skip: true }, () => {}));

export function describe(name, fn) {
  return nodeTest.describe(name, fn);
}
describe.runIf = (condition) => (name, fn) => (condition ? describe(name, fn) : nodeTest.describe(name, { skip: true }, () => {}));
describe.each = (values) => (name, fn) => {
  for (const value of values) describe(name.replace("%s", String(value)), () => fn(value));
};

export const afterEach = (fn) => nodeTest.afterEach(wrap(fn), { timeout: TIMEOUT });
export const beforeEach = (fn) => nodeTest.beforeEach(wrap(fn), { timeout: TIMEOUT });
