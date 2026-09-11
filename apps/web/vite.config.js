import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig(({ mode }) => {
    // The repo root .env is the single source of configuration (CLAUDE.md §11).
    const env = loadEnv(mode, resolve(__dirname, '../..'), '');
    return {
        plugins: [react()],
        resolve: {
            alias: {
                '@': resolve(__dirname, './src'),
                // @asset/shared is published as CommonJS for NestJS. Vite compiles its
                // TypeScript source directly instead, which keeps types live in dev
                // and removes any build-order dependency between the two packages.
                '@asset/shared': resolve(__dirname, '../../packages/shared/src'),
            },
        },
        define: {
            'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'),
        },
        server: {
            port: 5173,
            strictPort: true,
        },
        build: {
            outDir: 'dist',
            sourcemap: true,
            rollupOptions: {
                output: {
                    // Recharts and the table/query libraries change far less often than
                    // application code, so they get their own long-lived chunks.
                    manualChunks: {
                        react: ['react', 'react-dom', 'react-router-dom'],
                        charts: ['recharts'],
                        data: ['@tanstack/react-query', '@tanstack/react-table'],
                    },
                },
            },
        },
    };
});
//# sourceMappingURL=vite.config.js.map