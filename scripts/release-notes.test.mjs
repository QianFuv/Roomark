/** Verify complete LitRadar-style commit notes and published release baselines. @module */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatReleaseNotes, generateReleaseNotes, previousRelease } from "./release-notes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTEXT = { version: "0.1.0", repository: "QianFuv/Roomark" };
const COMMITS = [
  { hash: "a".repeat(40), subject: "fix(client): preserve data" },
  { hash: "b".repeat(40), subject: "feat(api)!: add bookings" },
  { hash: "c".repeat(40), subject: "Initial import <script> [link](bad)" },
  { hash: "d".repeat(40), subject: "docs: explain packages" },
];

test("the first release includes all commits grouped by conventional type with linked short SHAs", () => {
  const notes = formatReleaseNotes({ ...CONTEXT, commits: COMMITS });
  assert.match(notes, /^## Commits \(4\)/);
  assert.match(notes, /All commits in this first release\./);
  for (const category of ["Features", "Bug fixes", "Documentation", "Other commits"]) assert(notes.includes(`### ${category} (1)`));
  for (const { hash } of COMMITS) assert(notes.includes(`[${hash.slice(0, 7)}](https://github.com/QianFuv/Roomark/commit/${hash})`));
  assert(notes.indexOf("### Features") < notes.indexOf("### Bug fixes"));
  assert(notes.includes("&lt;script&gt; \\[link\\]\\(bad\\)"));
  assert(notes.includes("https://github.com/QianFuv/Roomark/commits/v0.1.0"));
});

test("later notes identify the previous release and link the comparison", () => {
  const notes = formatReleaseNotes({ ...CONTEXT, version: "0.2.0", previous: "v0.1.0", commits: COMMITS.slice(0, 1) });
  assert.match(notes, /Changes since v0\.1\.0\./);
  assert(notes.includes("https://github.com/QianFuv/Roomark/compare/v0.1.0...v0.2.0"));
  assert(!notes.includes("### Features"));
});

test("the baseline is the highest reachable older public stable release", () => {
  const tags = ["v0.1.0", "v0.2.0", "v0.3.0", "v0.4.0", "v0.5.0", "v0.6.0", "v1.0.0", "v0.7.0-beta.1"];
  const releases = tags.map((tag_name) => ({ tag_name, draft: tag_name === "v0.4.0", prerelease: tag_name === "v0.5.0" }));
  const reachable = new Set(tags.filter((tag) => tag !== "v0.6.0"));
  assert.equal(previousRelease(releases, reachable, "0.3.0"), "v0.2.0");
  assert.equal(previousRelease(releases, reachable, "0.9.0"), "v0.3.0");
  assert.equal(previousRelease(releases, reachable, "0.1.0"), undefined);
});

test("notes read every commit from the real checkout and paginate release metadata", async () => {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const requested = [];
  const notes = await generateReleaseNotes({ ...CONTEXT, commit, cwd: ROOT }, async (resource) => {
    requested.push(resource);
    return requested.length === 1 ? Array.from({ length: 100 }, () => ({ tag_name: "draft", draft: true })) : [];
  });
  assert.deepEqual(requested, ["releases?per_page=100&page=1", "releases?per_page=100&page=2"]);
  assert(notes.startsWith(`## Commits (${git("rev-list", "--count", commit)})`));
  for (const hash of git("rev-list", commit).split(/\r?\n/)) assert(notes.includes(`/commit/${hash}`));
});

test("notes reject malformed identities, failed metadata and oversized commit lists", async () => {
  assert.throws(() => formatReleaseNotes({ ...CONTEXT, commits: [{ hash: "bad", subject: "bad" }] }));
  assert.throws(() => formatReleaseNotes({ ...CONTEXT, commits: [{ hash: "a".repeat(40), subject: "x".repeat(125001) }] }), /body limit/);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  await assert.rejects(generateReleaseNotes({ ...CONTEXT, commit, cwd: ROOT }, async () => null), /Cannot list/);
});
