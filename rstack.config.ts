// Configuration guide: https://rstack.rs/config
import { define } from 'rstack';

define.lib({
  format: 'esm',
  syntax: 'es2022',
  dts: true,
  redirect: {
    // Keep declaration imports compatible with NodeNext/Node16 resolution.
    dts: { extension: true },
  },
  source: {
    tsconfigPath: './tsconfig.build.json',
    entry: {
      index: './src/index.ts',
    },
  },
});

define.test({
  testEnvironment: 'jsdom',
});

define.fmt({
  singleQuote: true,
  sortPackageJson: true,
  // Preserve upstream formatting for the request helper and parity tests.
  ignorePatterns: ['tests/api.ts', 'tests/api.test.ts'],
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}': ['rs lint', 'rs fmt'],
  '*.{json,md,mdx,css,scss,less,html,yml,yaml}': 'rs fmt',
});

define.lint(({ js, ts }) => [
  js.configs.recommended,
  ts.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
