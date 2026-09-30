import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Rust tarafı ve üretilen çıktılar lint edilmez.
  globalIgnores(["dist", "src-tauri", "coverage", "node_modules", "e2e/.artifacts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tauri-apps/api/core",
              importNames: ["invoke"],
              message: "invoke yalnızca src/lib/ipc.ts üzerinden çağrılmalı.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ipc.ts", "src/lib/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Node ortamında çalışan araç script'leri
    files: ["scripts/**/*.{js,mjs}", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
