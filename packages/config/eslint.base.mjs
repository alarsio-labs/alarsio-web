import js from "@eslint/js";
import tseslint from "typescript-eslint";

// No `any`, no unused code, no service-role key. CLAUDE.md: "no any".
export default tseslint.config(
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/service[_-]?role/i]",
          message: "The service-role key is never used in application code."
        }
      ]
    }
  }
);
