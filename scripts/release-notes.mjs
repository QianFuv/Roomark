/** Generate categorized, complete commit notes from published release history. @module */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { compareVersions, parseVersion } from "./release-version.mjs";

const COMMIT_TYPES = new Map([
  ["feat", "Features"],
  ["fix", "Bug fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactoring"],
  ["test", "Tests"],
  ["build", "Build"],
  ["ci", "CI"],
  ["docs", "Documentation"],
  ["style", "Style"],
  ["chore", "Maintenance"],
  ["revert", "Reverts"],
  ["other", "Other commits"],
]);

/**
 * Escape subjects so Markdown and HTML cannot change the rendered commit list.
 *
 * @param {string} subject - Original commit subject.
 * @returns {string} Safe Markdown text.
 */
function escapeSubject(subject) {
  return subject.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_{}\[\]()#!|~])/g, "\\$1");
}

/**
 * Select the highest older stable release whose tag is reachable from this commit.
 *
 * @param {object[]} releases - GitHub release metadata.
 * @param {Set<string>} reachableTags - Tags merged into the release source.
 * @param {string} version - Current stable version.
 * @returns {string | undefined} The previous published tag.
 */
export function previousRelease(releases, reachableTags, version) {
  parseVersion(version);
  return releases.filter((release) =>
    !release.draft && !release.prerelease &&
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.tag_name) &&
    reachableTags.has(release.tag_name) && compareVersions(release.tag_name.slice(1), version) < 0,
  ).sort((first, second) => compareVersions(second.tag_name.slice(1), first.tag_name.slice(1)))[0]?.tag_name;
}

/**
 * Format every commit under its conventional-commit category with linked SHAs.
 *
 * @param {object} context - Release and commit facts.
 * @param {string} context.version - Stable release version.
 * @param {string} context.repository - GitHub owner/repository.
 * @param {string} [context.serverUrl] - GitHub server URL.
 * @param {{hash: string, subject: string}[]} context.commits - Commits in oldest-first order.
 * @param {string} [context.previous] - Previous published tag, absent for the first release.
 * @returns {string} Complete Markdown release notes.
 */
export function formatReleaseNotes({ version, repository, serverUrl = "https://github.com", commits, previous }) {
  parseVersion(version);
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  const baseUrl = `${serverUrl.replace(/\/$/, "")}/${repository}`;
  const groups = new Map([...COMMIT_TYPES.keys()].map((type) => [type, []]));
  for (const { hash, subject } of commits) {
    assert.match(hash, /^[a-f0-9]{40}$/);
    const type = /^([a-z]+)(?:\([^\r\n)]+\))?!?:\s+/.exec(subject)?.[1];
    groups.get(COMMIT_TYPES.has(type) ? type : "other").push(`- ${escapeSubject(subject)} ([${hash.slice(0, 7)}](${baseUrl}/commit/${hash}))`);
  }
  const sections = [
    `## Commits (${commits.length})`,
    previous ? `Changes since ${previous}.` : "All commits in this first release.",
  ];
  for (const [type, entries] of groups) {
    if (entries.length) sections.push(`### ${COMMIT_TYPES.get(type)} (${entries.length})\n\n${entries.join("\n")}`);
  }
  const comparison = previous ? `compare/${previous}...v${version}` : `commits/v${version}`;
  sections.push(`**Full changelog:** [${previous ? `${previous}...v${version}` : `v${version}`}](${baseUrl}/${comparison})`);
  const notes = sections.join("\n\n") + "\n";
  assert(Buffer.byteLength(notes, "utf8") <= 125000, "Complete commit list exceeds the release body limit");
  return notes;
}

/**
 * Read the full source history and published releases to generate release notes.
 *
 * @param {object} context - Source and release identity.
 * @param {string} context.version - Stable release version.
 * @param {string} context.commit - Full source commit SHA.
 * @param {string} context.repository - GitHub owner/repository.
 * @param {string} [context.serverUrl] - GitHub server URL.
 * @param {string} [context.cwd] - Repository directory.
 * @param {(resource: string) => Promise<object[]>} request - Read GitHub release metadata.
 * @returns {Promise<string>} Complete Markdown release notes.
 */
export async function generateReleaseNotes({ version, commit, repository, serverUrl, cwd = process.cwd() }, request) {
  parseVersion(version);
  assert.match(commit, /^[a-f0-9]{40}$/);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
  assert.equal(git("rev-parse", "--is-shallow-repository"), "false", "Release notes require full Git history");
  const reachableTags = new Set(git("tag", "--merged", commit).split(/\r?\n/));
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await request(`releases?per_page=100&page=${page}`);
    assert(Array.isArray(batch), "Cannot list published releases");
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  const previous = previousRelease(releases, reachableTags, version);
  const log = git("log", "--reverse", "--format=%H%x00%s", previous ? `${previous}..${commit}` : commit, "--");
  const commits = log ? log.split(/\r?\n/).map((line) => {
    const separator = line.indexOf("\0");
    return { hash: line.slice(0, separator), subject: line.slice(separator + 1) };
  }) : [];
  return formatReleaseNotes({ version, repository, serverUrl, commits, previous });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/);
  const notes = await generateReleaseNotes({
    version: process.env.VERSION,
    commit: process.env.GITHUB_SHA,
    repository,
    serverUrl: process.env.GITHUB_SERVER_URL,
  }, async (resource) => JSON.parse(execFileSync("gh", ["api", `repos/${repository}/${resource}`], { encoding: "utf8", timeout: 30000 })));
  fs.writeFileSync(process.argv[2], notes);
}
