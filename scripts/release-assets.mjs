/** Validate release asset membership and write the SHA256SUMS manifest. @module */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseVersion } from "./release-version.mjs";

/**
 * Return the exact archive names for a release, including Android when signed.
 *
 * @param {string} inputVersion - Stable release version.
 * @param {boolean} [includeAndroid] - Whether a signed Android package is available.
 * @returns {string[]} Expected package names, excluding the checksum manifest.
 */
export function releaseAssetNames(inputVersion, includeAndroid = false) {
  const version = parseVersion(inputVersion);
  return [
    `roomark-server_${version}_linux_amd64.tar.gz`,
    `roomark-server_${version}_windows_amd64.zip`,
    `roomark-client_${version}_windows_amd64.zip`,
    ...(includeAndroid ? [`roomark-client_${version}_android_arm64.apk`] : []),
  ];
}

/**
 * Require complete package membership and reject debug APKs before publication.
 *
 * @param {string} directory - Directory containing only release packages.
 * @param {string} version - Stable release version.
 * @returns {string} The generated checksum manifest.
 */
export function writeChecksums(directory, version) {
  const names = fs.readdirSync(directory).filter((name) => name !== "SHA256SUMS");
  const android = `roomark-client_${parseVersion(version)}_android_arm64.apk`;
  const expected = releaseAssetNames(version, names.includes(android));
  assert.deepEqual(names.sort(), expected.sort(), "Release assets must match the expected platforms; debug APKs cannot be published");
  const manifest = names.map((name) => {
    const bytes = fs.readFileSync(path.join(directory, name));
    assert(bytes.length > 0, `Empty release asset: ${name}`);
    return `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`;
  }).join("");
  fs.writeFileSync(path.join(directory, "SHA256SUMS"), manifest);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(writeChecksums(process.argv[2], process.argv[3]));
}
