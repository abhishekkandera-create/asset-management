import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * NestJS relies on `emitDecoratorMetadata`, which esbuild does not produce.
 * The SWC plugin compiles the sources instead, so DI works inside tests.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    root: './',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/**/dto/**'],
    },
  },
});
