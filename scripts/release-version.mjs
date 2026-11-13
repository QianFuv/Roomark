/**
 * Decide whether a CI run publishes a release, and keep every version
 * declaration in step with the repository VERSION file.
 *
 * @module
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Validate a stable MAJOR.MINOR.PATCH version.
 *
 * @param {string} value - Raw version text, surrounding whitespace allowed.
 * @returns {string} The trimmed version.
 */
export function parseVersion(value) {
  const version = value.trim();
  assert.match(version, VERSION_PATTERN, `VERSION must be MAJOR.MINOR.PATCH, got "${version}"`);
  return version;
}

/**
 * Compare two versions numerically.
 *
 * @param {string} first - The left version.
 * @param {string} second - The right version.
 * @returns {number} 1 when first is higher, -1 when lower, 0 when equal.
 */
export function compareVersions(first, second) {
  const firstParts = parseVersion(first).split(".").map(BigInt);
  const secondParts = parseVersion(second).split(".").map(BigInt);
  const index = firstParts.findIndex((part, position) => part !== secondParts[position]);
  if (index < 0) return 0;
  return firstParts[index] > secondParts[index] ? 1 : -1;
}

/**
 * Read every version declaration that ships inside a build and require them
 * to equal VERSION. Android and the Go host read VERSION directly.
 *
 * @param {string} root - Repository root.
 * @returns {string} The repository version.
 */
export function checkVersionFiles(root) {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const version = parseVersion(read("VERSION"));
  const config = read("build/config.yml").match(/^info:\r?\n(?:[ \t].*\r?\n)*?[ \t]+version:\s*"([^"]+)"/m);
  assert(config, "build/config.yml must declare info.version");
  assert.equal(config[1], version, "build/config.yml info.version must equal VERSION");
  const windows = JSON.parse(read("build/windows/info.json"));
  const windowsVersions = [
    windows.fixed.file_version,
    windows.fixed.product_version,
    windows.info["0409"].FileVersion,
    windows.info["0409"].ProductVersion,
  ];
  for (const declared of windowsVersions) {
    assert.equal(declared, version, "build/windows/info.json versions must equal VERSION");
  }
  return version;
}

/**
 * Decide the release for a CI event. A push to main releases when VERSION
 * increased across the pushed range; a manual run releases the checked-in
 * VERSION, which must match the requested one. A branch without a VERSION
 * baseline never releases on push.
 *
 * @param {object} event - CI event facts.
 * @param {string} event.name - GitHub event name.
 * @param {string} event.ref - Git ref of the run.
 * @param {string} event.version - The checked-in VERSION at the run commit.
 * @param {string | undefined} event.previous - VERSION at the previous tip, if it existed.
 * @param {string | undefined} event.requested - Version typed into a manual run.
 * @returns {{ release: boolean, version: string }} The release decision.
 */
export function decideRelease({ name, ref, version, previous, requested }) {
  if (name === "pull_request" || ref !== "refs/heads/main") return { release: false, version };
  if (name === "workflow_dispatch") {
    assert.equal(parseVersion(requested ?? ""), version, "The requested version must equal VERSION on main");
    return { release: true, version };
  }
  assert.equal(name, "push", `Unsupported event ${name}`);
  if (previous === undefined) return { release: false, version };
  const difference = compareVersions(version, previous);
  assert(difference >= 0, `VERSION must not decrease (${previous} -> ${version})`);
  return { release: difference > 0, version };
}

/**
 * Read VERSION at a commit, or undefined when the commit or file is absent.
 *
 * @param {string | undefined} commit - Commit SHA.
 * @returns {string | undefined} The version text.
 */
function versionAt(commit) {
  if (!commit || /^0+$/.test(commit)) return undefined;
  try {
    return execFileSync("git", ["show", `${commit}:VERSION`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = checkVersionFiles(process.cwd());
  const result = decideRelease({
    name: process.env.GITHUB_EVENT_NAME ?? "",
    ref: process.env.GITHUB_REF ?? "",
    version,
    previous: versionAt(process.env.BEFORE_SHA)?.trim(),
    requested: process.env.REQUESTED_VERSION,
  });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `release=${result.release}\nversion=${result.version}\n`);
  }
  console.log(result);
}
