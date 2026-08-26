import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    globals: true,
    // The default 'forks' pool spawns subprocesses, which breaks on Windows
    // when the repo path contains a space; 'threads' runs in-process instead.
    pool: 'threads',
  },
})
