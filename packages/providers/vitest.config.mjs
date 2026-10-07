import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], exclude: ['src/sapiom.live.test.ts'] },
})
