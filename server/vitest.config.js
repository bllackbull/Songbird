import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,mjs,cjs}'],
    reporters: ['default'],
  },
});



