import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, Plugin } from 'vite';

/** Writes dist/sw.js with the exact list of built files and a content hash as cache version. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pour-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).sort();
      const tpl = readFileSync('sw/sw-template.js', 'utf8');
      const hash = createHash('sha256').update(tpl);
      for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const precache = ['./', ...list.map((f) => `./${f}`)];
      writeFileSync(
        join(outDir, 'sw.js'),
        tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
      );
      console.log(`sw.js: ${precache.length} files, cache pour-${version}`);
    },
  };
}

export default defineConfig({
  // relative base: works at https://<user>.github.io/pour-sort/ and anywhere else
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2020', assetsInlineLimit: 0 },
  plugins: [serviceWorker()],
  test: { include: ['tests/**/*.test.ts'] },
} as any);
