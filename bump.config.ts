import { defineConfig } from 'bumpp';

// Bump the version locally (`pnpm bump`) and commit it, but do NOT tag or push.
// The Release workflow reads the committed version, then creates and pushes the
// tag itself before publishing.
export default defineConfig({
  files: ['./package.json'],
  commit: 'v%s',
  confirm: false,
  tag: false,
  push: false,
});
