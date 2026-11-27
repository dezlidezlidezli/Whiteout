import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Extra HTML pages built by other parts of the project, included only when present.
const optionalPages = ['gallery.html', 'audio-test.html'];
const input: Record<string, string> = { main: resolve(root, 'index.html') };
for (const page of optionalPages) {
  const file = resolve(root, page);
  if (existsSync(file)) input[page.replace(/\.html$/, '')] = file;
}

/** Files under dist/ that the service worker must NOT precache. */
const precacheExclude = (rel: string) =>
  rel === 'sw.js' || rel === 'version.json' || rel === '.nojekyll' || rel.startsWith('splash/') || rel.endsWith('.map');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Generates dist/sw.js after the build: a precache list of every emitted file plus a
 * version derived from the content of all of them (so any change ships a new worker).
 * Hand-written instead of vite-plugin-pwa: no workbox dependency tree, nothing that can
 * break with Vite/Rolldown upgrades, and full control of the iOS update behaviour.
 */
function frostkettlePwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'fk-pwa',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      if (!existsSync(join(outDir, 'index.html'))) return;
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => !precacheExclude(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) {
        hash.update(f);
        hash.update(readFileSync(join(outDir, f)));
      }
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve(root, 'scripts/sw-template.js'), 'utf8');
      const sw = template
        .replace("'__FK_VERSION__'", JSON.stringify(version))
        .replace('__FK_FILES__', JSON.stringify(files, null, 0));
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version, files: files.length }) + '\n');
      config.logger.info(`fk-pwa: sw.js version ${version}, ${files.length} files precached`);
    },
  };
}

// Build identity shown in the app: major.minor from package.json + commit count, and the short commit id.
function git(args: string): string {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
const [major, minor] = pkg.version.split('.');
const appVersion = `${major}.${minor}.${git('rev-list --count HEAD') || '0'}`;
const appBuild = git('rev-parse --short HEAD') || 'local';

// Relative base so the build works at any path (GitHub Pages serves from /<repo>/).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion), __APP_BUILD__: JSON.stringify(appBuild) },
  plugins: [frostkettlePwa()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: { input },
  },
  server: { host: true },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
