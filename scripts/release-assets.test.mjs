/** Verify release package membership and content checksums before publication. @module */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { releaseAssetNames, writeChecksums } from "./release-assets.mjs";

test("release names match the component, version, OS and architecture contract", () => {
  assert.deepEqual(releaseAssetNames("0.1.0", true), [
    "roomark-server_0.1.0_linux_amd64.tar.gz",
    "roomark-server_0.1.0_windows_amd64.zip",
    "roomark-client_0.1.0_windows_amd64.zip",
    "roomark-client_0.1.0_android_arm64.apk",
  ]);
  assert.throws(() => releaseAssetNames("../bad"));
});

for (const includeAndroid of [false, true]) {
  test(`checksums cover exactly the release bytes, Android=${includeAndroid}`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "roomark-assets-"));
    for (const name of releaseAssetNames("0.1.0", includeAndroid)) fs.writeFileSync(path.join(directory, name), name);
    const manifest = writeChecksums(directory, "0.1.0");
    assert.equal(fs.readFileSync(path.join(directory, "SHA256SUMS"), "utf8"), manifest);
    for (const line of manifest.trim().split("\n")) {
      const [hash, name] = line.split("  ");
      assert.equal(hash, createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex"));
    }
    assert.equal(manifest.trim().split("\n").length, includeAndroid ? 4 : 3);
    assert.equal(writeChecksums(directory, "0.1.0"), manifest);
  });
}

test("debug APKs, missing platforms, unexpected names and empty files fail", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "roomark-assets-"));
  const names = releaseAssetNames("0.1.0");
  for (const name of names) fs.writeFileSync(path.join(directory, name), name);
  const debug = path.join(directory, "roomark-client_0.1.0_android_arm64_debug-signed.apk");
  fs.writeFileSync(debug, "debug APK");
  assert.throws(() => writeChecksums(directory, "0.1.0"), /debug APKs/);
  fs.unlinkSync(debug);
  fs.writeFileSync(path.join(directory, names[0]), "");
  assert.throws(() => writeChecksums(directory, "0.1.0"), /Empty release asset/);
  fs.unlinkSync(path.join(directory, names[0]));
  assert.throws(() => writeChecksums(directory, "0.1.0"), /expected platforms/);
});
