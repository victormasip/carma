import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not app code — vendored agent-skill scripts, design mockups and the
    // WordPress plugin (its own toolchain). Linting them buries real findings.
    ".agents/**",
    ".claude/**",
    "landing/**",
    "wordpress-plugin/**",
  ]),
]);

export default eslintConfig;
