/**
 * Release rules: only a VERSION increase on main publishes, and every shipped
 * version declaration must agree with VERSION.
 *
 * @module
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkVersionFiles, compareVersions, decideRelease, parseVersion } from "./release-version.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("versions compare numerically, not lexically", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.9.9", "1.0.0"), -1);
  assert.throws(() => parseVersion("1.0"));
  assert.throws(() => parseVersion("v1.0.0"));
  assert.throws(() => parseVersion("01.0.0"));
});

test("a push to main releases only when VERSION increases", () => {
  const push = { name: "push", ref: "refs/heads/main", requested: undefined };
  assert.deepEqual(decideRelease({ ...push, version: "1.1.0", previous: "1.0.0" }), { release: true, version: "1.1.0" });
  assert.deepEqual(decideRelease({ ...push, version: "1.0.0", previous: "1.0.0" }), { release: false, version: "1.0.0" });
  assert.deepEqual(decideRelease({ ...push, version: "1.0.0", previous: undefined }), { release: false, version: "1.0.0" });
  assert.throws(() => decideRelease({ ...push, version: "1.0.0", previous: "1.2.0" }), /must not decrease/);
});

test("pull requests and other branches never release", () => {
  const facts = { version: "2.0.0", previous: "1.0.0", requested: undefined };
  assert.equal(decideRelease({ ...facts, name: "pull_request", ref: "refs/pull/1/merge" }).release, false);
  assert.equal(decideRelease({ ...facts, name: "push", ref: "refs/heads/feature" }).release, false);
});

test("a manual run releases the checked-in VERSION only", () => {
  const manual = { name: "workflow_dispatch", ref: "refs/heads/main", version: "1.0.0", previous: undefined };
  assert.deepEqual(decideRelease({ ...manual, requested: "1.0.0" }), { release: true, version: "1.0.0" });
  assert.throws(() => decideRelease({ ...manual, requested: "1.0.1" }));
});

test("the repository version declarations agree", () => {
  assert.equal(checkVersionFiles(ROOT), parseVersion(fs.readFileSync(path.join(ROOT, "VERSION"), "utf8")));
});

test("a stale Windows resource version is rejected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "roomark-version-"));
  fs.mkdirSync(path.join(root, "build/windows"), { recursive: true });
  fs.writeFileSync(path.join(root, "VERSION"), "1.2.0\n");
  fs.writeFileSync(path.join(root, "build/config.yml"), 'info:\n  productName: "Roomark"\n  version: "1.2.0"\n');
  const windows = {
    fixed: { file_version: "1.2.0", product_version: "1.2.0" },
    info: { "0409": { FileVersion: "1.1.0", ProductVersion: "1.2.0" } },
  };
  fs.writeFileSync(path.join(root, "build/windows/info.json"), JSON.stringify(windows));
  assert.throws(() => checkVersionFiles(root), /info\.json/);
});
