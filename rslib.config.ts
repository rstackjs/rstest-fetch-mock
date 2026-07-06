import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      dts: true,
      redirect: {
        // Append `.js` to relative imports in emitted .d.ts so they resolve
        // under NodeNext/Node16 module resolution (ESM requires explicit ext).
        dts: { extension: true },
      },
    },
  ],
  source: {
    tsconfigPath: './tsconfig.build.json',
    entry: {
      index: './src/index.ts',
    },
  },
});
