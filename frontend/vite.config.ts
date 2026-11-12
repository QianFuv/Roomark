import babel from "@rolldown/plugin-babel";
import stylex from "@stylexjs/unplugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import browserslist from "browserslist";
import browserslistToEsbuild from "browserslist-to-esbuild";
import { Features, browserslistToTargets } from "lightningcss";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

/** Browser baseline: every release since January 1 of last year. */
const BROWSER_QUERY = [`since ${new Date().getFullYear() - 1}-01-01`];

const CSS_TARGETS = browserslistToTargets(browserslist(BROWSER_QUERY));

/** Optional Roomark server to proxy `/api` to during `vp dev` / `vp preview`, e.g. `http://127.0.0.1:18080`. */
const API_PROXY = process.env["ROOMARK_API_PROXY"];

const GENERATED_FILES = [
  "dist/**",
  "bindings/**",
  "src/api/schema.d.ts",
  "src/routeTree.gen.ts",
  "playwright-report/**",
  "test-results/**",
];

export default defineConfig(({ mode }) => ({
  publicDir: mode === "test" || mode === "mock" ? "test-public" : "public",
  optimizeDeps:
    mode === "test"
      ? {
          include: [
            "@stylexjs/stylex/lib/stylex-inject",
            "motion/react",
            "msw",
            "msw/browser",
            "vitest-browser-react",
          ],
        }
      : {},
  server: {
    host: "127.0.0.1",
    port: Number(process.env["WAILS_VITE_PORT"]) || 9245,
    strictPort: true,
    proxy:
      API_PROXY === undefined ? undefined : { "/api": API_PROXY, "/ical": API_PROXY, "/wails": API_PROXY },
  },
  preview: {
    proxy:
      API_PROXY === undefined ? undefined : { "/api": API_PROXY, "/ical": API_PROXY, "/wails": API_PROXY },
  },
  build: {
    target: browserslistToEsbuild(BROWSER_QUERY),
    cssTarget: browserslistToEsbuild(BROWSER_QUERY),
    chunkSizeWarningLimit: 1200,
  },
  plugins: lazyPlugins(() => [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    stylex.vite({
      dev: mode === "development" || mode === "test",
      runtimeInjection: mode === "test",
      useCSSLayers: true,
      lightningcssOptions: { targets: CSS_TARGETS, exclude: Features.LightDark },
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ]),
  test: {
    include: ["src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.tsx"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
  lint: {
    ignorePatterns: GENERATED_FILES,
    options: { typeAware: true, typeCheck: true },
    jsPlugins: ["@stylexjs/eslint-plugin", { name: "anti-slop", specifier: "oxlint-anti-slop" }],
    rules: {
      "@stylexjs/valid-styles": "error",
      "@stylexjs/no-unused": "error",
      "@stylexjs/valid-shorthands": "error",
      "@stylexjs/no-conflicting-props": "error",
      "@stylexjs/no-legacy-contextual-styles": "error",
      "@stylexjs/no-lookahead-selectors": "error",
      "@stylexjs/no-nonstandard-styles": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-unnecessary-type-widening": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-typeof-outside-guards": "error",
      "anti-slop/no-meaningless-unknown-aliases": "error",
      "anti-slop/no-unsafe-dictionary-values": "error",
      "anti-slop/no-narrowing-after-widening": "error",
      "anti-slop/require-type-assertion-justification": "error",
      "anti-slop/tests-require-given-when-then": "error",
      "anti-slop/require-logical-blank-lines": "error",
    },
  },
  fmt: {
    ignorePatterns: GENERATED_FILES,
    printWidth: 110,
  },
}));
