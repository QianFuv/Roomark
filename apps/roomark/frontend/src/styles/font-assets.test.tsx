/**
 * Local font assets and their global activation: the generated stylesheets and the WOFF2 chunks
 * form an exact closed set per weight, only 400 and 700 exist and are used, and the app and the
 * QR poster render in JetBrainsLxgwNerdMono.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";

import "./base.css";
import baseCss from "./base.css?raw";

const FONT_FAMILY = "JetBrainsLxgwNerdMono";

const REGULAR_FILES = import.meta.glob("../../assets/JetBrainsLxgwNerdMono-Regular/*", {
  query: "?url",
  import: "default",
});

const BOLD_FILES = import.meta.glob("../../assets/JetBrainsLxgwNerdMono-Bold/*", {
  query: "?url",
  import: "default",
});

const STYLESHEETS = import.meta.glob<string>("../../assets/JetBrainsLxgwNerdMono-*/result.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SOURCES = import.meta.glob<string>(["../**/*.tsx", "!../**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const FONT_ASSET_EXPECTATIONS = [
  { directoryName: "JetBrainsLxgwNerdMono-Regular", files: REGULAR_FILES, faceCount: 344, fontWeight: 400 },
  { directoryName: "JetBrainsLxgwNerdMono-Bold", files: BOLD_FILES, faceCount: 324, fontWeight: 700 },
] as const;

const FORBIDDEN_ARCHIVE_FILES = ["index.html", "index.proto", "reporter.bin"] as const;

/**
 * Base name of a glob key.
 *
 * @param key - Glob key such as `../../assets/x/result.css`.
 * @returns The file name.
 */
function baseName(key: string): string {
  return key.slice(key.lastIndexOf("/") + 1);
}

/**
 * Relative WOFF2 file names referenced by a generated stylesheet, in source order.
 *
 * @param stylesheet - Generated font stylesheet.
 * @returns Referenced WOFF2 base names.
 */
function woff2References(stylesheet: string): string[] {
  return Array.from(stylesheet.matchAll(/url\(["']?\.\/([^"')]+\.woff2)["']?\)/g), (match) => match[1] ?? "");
}

describe("global font assets", () => {
  test("given each weight directory when matching its stylesheet then every WOFF2 file is referenced exactly once", () => {
    for (const expectation of FONT_ASSET_EXPECTATIONS) {
      const names = Object.keys(expectation.files).map(baseName).sort();
      const woff2Files = names.filter((name) => name.endsWith(".woff2"));
      const stylesheet = STYLESHEETS[`../../assets/${expectation.directoryName}/result.css`] ?? "";
      const references = woff2References(stylesheet);

      expect(names).toEqual(["result.css", ...woff2Files].sort());
      expect(woff2Files).toHaveLength(expectation.faceCount);
      expect(new Set(references).size).toBe(expectation.faceCount);
      expect([...references].sort()).toEqual(woff2Files);
      expect(stylesheet.match(/@font-face/g)).toHaveLength(expectation.faceCount);
      expect(stylesheet.match(new RegExp(`font-weight:\\s*${expectation.fontWeight}\\b`, "g"))).toHaveLength(
        expectation.faceCount,
      );
      expect(stylesheet).toMatch(new RegExp(`font-family:\\s*["']${FONT_FAMILY}["']`));
      expect(stylesheet).toMatch(/font-display:\s*swap/);
      expect(stylesheet).toContain("SIL Open Font License, Version 1.1");
      expect(stylesheet).toContain("JetBrains Mono: OFL-1.1, LXGW WenKai: OFL-1.1, Nerd Fonts: MIT.");

      for (const forbidden of FORBIDDEN_ARCHIVE_FILES) expect(names).not.toContain(forbidden);
    }
  });

  test("given the global stylesheet when the page renders then both weights are imported and active", async () => {
    expect(baseCss).toContain('@import "../../assets/JetBrainsLxgwNerdMono-Regular/result.css";');
    expect(baseCss).toContain('@import "../../assets/JetBrainsLxgwNerdMono-Bold/result.css";');
    expect(getComputedStyle(document.documentElement).fontFamily).toContain(FONT_FAMILY);

    const regular = await document.fonts.load(`400 16px "${FONT_FAMILY}"`, "会议室 9070");
    const bold = await document.fonts.load(`700 16px "${FONT_FAMILY}"`, "会议室 9070");

    expect(regular.map((face) => face.weight)).toContain("400");
    expect(bold.map((face) => face.weight)).toContain("700");
  });

  test("given every source file when reading font styles then only the two shipped weights and no raw sizes appear", () => {
    for (const [path, source] of Object.entries(SOURCES)) {
      const weights = Array.from(source.matchAll(/fontWeight:\s*["']?(\d+)/g), (match) => match[1]);
      const canvasWeights = Array.from(source.matchAll(/font = `(\d+) /g), (match) => match[1]);

      expect(
        [...weights, ...canvasWeights].filter((weight) => weight !== "400" && weight !== "700"),
        path,
      ).toEqual([]);
      expect(source.match(/fontSize:\s*\{?\s*(default:\s*)?\d/g), path).toBeNull();
    }
  });
});
