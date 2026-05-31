import type { Fs } from './fs';

export interface DomainMeta {
  name: string;
  displayName: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DomainFiles {
  html: string;
  css: string;
  js: string;
}

const ROOT = '/domains';
const HISTORY_LIMIT = 20;

/** Monotonically increasing timestamp — guarantees unique backup folder names even if two calls land in the same millisecond. */
let _lastTs = 0;
function uniqueTs(): number {
  const now = Date.now();
  _lastTs = now > _lastTs ? now : _lastTs + 1;
  return _lastTs;
}

function paths(name: string) {
  const base = `${ROOT}/${name}`;
  return {
    base,
    meta: `${base}/meta.json`,
    html: `${base}/index.html`,
    css: `${base}/style.css`,
    js: `${base}/script.js`,
    history: `${base}/history`,
  };
}

function defaultFiles(displayName: string): DomainFiles {
  return {
    html: `<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>${displayName}</h1><p>아직 내용이 없습니다. GPT에게 만들어달라고 해보세요.</p><script src="script.js"></script></body></html>`,
    css: `body { font-family: system-ui; padding: 16px; color: #222; }`,
    js: ``,
  };
}

export function createDomains(fs: Fs) {
  async function backup(name: string) {
    const p = paths(name);
    const ts = uniqueTs();
    const dst = `${p.history}/${ts}`;
    for (const file of ['index.html', 'style.css', 'script.js'] as const) {
      const src = `${p.base}/${file}`;
      if (await fs.exists(src)) {
        await fs.copy(src, `${dst}/${file}`);
      }
    }
    const entries = await fs.list(p.history).catch(() => [] as string[]);
    const sorted = entries.map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    if (sorted.length > HISTORY_LIMIT) {
      const drop = sorted.slice(0, sorted.length - HISTORY_LIMIT);
      for (const d of drop) {
        await fs.remove(`${p.history}/${d}`);
      }
    }
  }

  return {
    async create(name: string, displayName: string, icon?: string): Promise<DomainMeta> {
      const p = paths(name);
      const now = Date.now();
      const meta: DomainMeta = { name, displayName, icon, createdAt: now, updatedAt: now };
      const def = defaultFiles(displayName);
      await fs.write(p.meta, JSON.stringify(meta, null, 2));
      await fs.write(p.html, def.html);
      await fs.write(p.css, def.css);
      await fs.write(p.js, def.js);
      return meta;
    },

    async list(): Promise<DomainMeta[]> {
      const names = await fs.list(ROOT).catch(() => [] as string[]);
      const out: DomainMeta[] = [];
      for (const name of names) {
        const metaPath = paths(name).meta;
        if (await fs.exists(metaPath)) {
          out.push(JSON.parse(await fs.read(metaPath)));
        }
      }
      return out;
    },

    async read(name: string): Promise<DomainFiles> {
      const p = paths(name);
      return {
        html: await fs.read(p.html).catch(() => ''),
        css: await fs.read(p.css).catch(() => ''),
        js: await fs.read(p.js).catch(() => ''),
      };
    },

    async update(name: string, files: Partial<DomainFiles>) {
      const p = paths(name);
      await backup(name);
      if (files.html != null) await fs.write(p.html, files.html);
      if (files.css != null) await fs.write(p.css, files.css);
      if (files.js != null) await fs.write(p.js, files.js);
      if (await fs.exists(p.meta)) {
        const meta: DomainMeta = JSON.parse(await fs.read(p.meta));
        meta.updatedAt = Date.now();
        await fs.write(p.meta, JSON.stringify(meta, null, 2));
      }
    },

    async history(name: string): Promise<number[]> {
      const entries = await fs.list(paths(name).history).catch(() => [] as string[]);
      return entries.map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => b - a);
    },

    async revert(name: string, steps = 1) {
      const hist = await this.history(name);
      if (hist.length < steps) throw new Error(`not enough history (have ${hist.length}, need ${steps})`);
      const target = hist[steps - 1];
      const p = paths(name);
      const src = `${p.history}/${target}`;
      await backup(name);
      for (const file of ['index.html', 'style.css', 'script.js'] as const) {
        if (await fs.exists(`${src}/${file}`)) {
          await fs.copy(`${src}/${file}`, `${p.base}/${file}`);
        }
      }
    },

    async delete(name: string) {
      await fs.remove(paths(name).base);
    },
  };
}

export type Domains = ReturnType<typeof createDomains>;
