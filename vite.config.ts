import { defineConfig } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  server: {
    watch: {
      ignored: ['**/artifacts/**', '**/test-results/**', '**/playwright-report/**', '**/.local/**'],
    },
  },
  build: { target: 'es2022' },
  plugins: [
    {
      name: 'private-local-sample',
      configureServer(server) {
        const file = resolve('.local/sample-2.mp3');
        server.middlewares.use('/local-sample-2', (req, res) => {
          if (!existsSync(file)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Length', statSync(file).size);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          createReadStream(file).pipe(res);
        });
      },
    },
  ],
});
