import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import tseslint from "@typescript-eslint/eslint-plugin";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "functions/**", "scripts/**"],
  },
  {
    extends: [...next],
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Règle purement cosmétique (apostrophes françaises dans le texte JSX) : bruyante, aucun bug réel.
      "react/no-unescaped-entities": "off",
    },
  },
]);
