// Expo's flat config, plus the rules CLAUDE.md asks for. Moves to packages/config
// once that package exists (see issue #14).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/*', 'dist/*', 'expo-env.d.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);
