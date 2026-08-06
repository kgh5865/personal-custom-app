import type { Fs } from './fs';
import type { Db } from './db';

// 현 스키마 버전. 필드가 늘어나면 이 숫자를 올리고 migrate() 에 케이스 추가.
// 옛 파일은 항상 관용적으로 읽고 필요시 자동 마이그레이션한다 (절대 실패로 처리하지 않음).
export const DOMAIN_META_VERSION = 1;

export interface DomainMeta {
  schemaVersion: number;
  name: string;
  displayName: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

function migrateMeta(raw: any, name: string): DomainMeta {
  const now = Date.now();
  return {
    schemaVersion: DOMAIN_META_VERSION,
    name: typeof raw?.name === 'string' ? raw.name : name,
    displayName: typeof raw?.displayName === 'string' ? raw.displayName : name,
    icon: typeof raw?.icon === 'string' ? raw.icon : undefined,
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

export interface TrashEntry {
  folder: string;
  name: string;
  displayName: string;
  icon?: string;
  deletedAt: number;
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

// domain_meta 테이블 row <-> DomainMeta 변환
function rowToMeta(row: any): DomainMeta {
  return {
    schemaVersion: DOMAIN_META_VERSION,
    name: row.name,
    displayName: row.display_name,
    icon: row.icon ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDomains(fs: Fs, db: Db) {
  async function upsertMeta(meta: DomainMeta) {
    await db.execute(
      `INSERT INTO domain_meta (name, display_name, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET display_name = excluded.display_name, icon = excluded.icon, updated_at = excluded.updated_at`,
      [meta.name, meta.displayName, meta.icon ?? null, meta.createdAt, meta.updatedAt]
    );
  }

  async function deleteMetaRow(name: string) {
    await db.execute(`DELETE FROM domain_meta WHERE name = ?`, [name]);
  }

  // meta.json (source of truth) 을 스캔해 DomainMeta 목록을 만든다. list() 의 self-heal 에도 재사용.
  async function scanFs(): Promise<DomainMeta[]> {
    const names = (await fs.list(ROOT).catch(() => [] as string[])).filter(n => !n.startsWith('.'));
    const out: DomainMeta[] = [];
    for (const name of names) {
      const metaPath = paths(name).meta;
      if (await fs.exists(metaPath)) {
        const raw = JSON.parse(await fs.read(metaPath));
        const migrated = migrateMeta(raw, name);
        if (raw?.schemaVersion !== DOMAIN_META_VERSION) {
          // 옛 파일을 만나면 조용히 최신 형식으로 다시 저장
          await fs.write(metaPath, JSON.stringify(migrated, null, 2));
        }
        out.push(migrated);
      }
    }
    return out;
  }

  // update()/patch() 공통: meta.json 의 updatedAt 만 갱신
  async function touchMeta(name: string) {
    const p = paths(name);
    if (await fs.exists(p.meta)) {
      const raw = JSON.parse(await fs.read(p.meta));
      const meta = migrateMeta(raw, name);
      meta.updatedAt = uniqueTs();
      await fs.write(p.meta, JSON.stringify(meta, null, 2));
    }
  }

  async function backup(name: string) {
    const p = paths(name);
    const ts = uniqueTs();
    const dst = `${p.history}/${ts}`;
    // fs.copy is a thin Capacitor binding that requires the destination dir to exist.
    // fs.mkdir is idempotent (swallows EEXIST), so this is safe to call unconditionally.
    await fs.mkdir(p.history);
    await fs.mkdir(dst);
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
      const now = uniqueTs();
      const meta: DomainMeta = {
        schemaVersion: DOMAIN_META_VERSION,
        name, displayName, icon, createdAt: now, updatedAt: now,
      };
      const def = defaultFiles(displayName);
      await fs.write(p.meta, JSON.stringify(meta, null, 2));
      await fs.write(p.html, def.html);
      await fs.write(p.css, def.css);
      await fs.write(p.js, def.js);
      await upsertMeta(meta);
      return meta;
    },

    async list(): Promise<DomainMeta[]> {
      const { rows } = await db.query(
        `SELECT name, display_name, icon, created_at, updated_at FROM domain_meta`
      );
      const fsNames = (await fs.list(ROOT).catch(() => [] as string[])).filter(n => !n.startsWith('.'));
      if (rows.length === 0 || rows.length !== fsNames.length) {
        // 테이블이 비었거나 파일시스템과 개수가 어긋남 (DB 유실/백업 복원 등) → meta.json 을 스캔해 재구축
        const scanned = await scanFs();
        for (const meta of scanned) await upsertMeta(meta);
        return scanned;
      }
      return rows.map(rowToMeta);
    },

    async read(name: string): Promise<DomainFiles> {
      const p = paths(name);
      if (!(await fs.exists(p.meta))) {
        throw new Error(`domain not found: ${name}`);
      }
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
      await touchMeta(name);
    },

    // 전체 교체(update) 대신 문자열 검색/치환으로 부분 패치. search 가 정확히 한 번만 나와야 한다.
    async patch(name: string, file: 'html' | 'css' | 'js', search: string, replace: string) {
      const p = paths(name);
      const fileMap = { html: p.html, css: p.css, js: p.js };
      if (!(file in fileMap)) {
        throw new Error(`patch_screen: 알 수 없는 파일 종류입니다: ${file}`);
      }
      const target = fileMap[file];
      const content = await fs.read(target).catch(() => '');
      const count = content.split(search).length - 1;
      if (count === 0) {
        throw new Error(`patch_screen: '${file}' 에서 검색 문자열을 찾지 못했습니다`);
      }
      if (count > 1) {
        throw new Error(`patch_screen: '${file}' 에서 검색 문자열이 ${count}번 발견되어 모호합니다`);
      }
      await backup(name);
      await fs.write(target, content.replace(search, replace));
      await touchMeta(name);
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

    // 완전삭제 대신 휴지통(domains/.trash)으로 이동한다.
    async delete(name: string) {
      const p = paths(name);
      const ts = uniqueTs();
      const trashBase = `${ROOT}/.trash/${name}-${ts}`;
      await fs.mkdir(trashBase);
      for (const file of ['meta.json', 'index.html', 'style.css', 'script.js'] as const) {
        const src = `${p.base}/${file}`;
        if (await fs.exists(src)) await fs.copy(src, `${trashBase}/${file}`);
      }
      // history 스냅샷도 함께 이동
      const histEntries = await fs.list(p.history).catch(() => [] as string[]);
      if (histEntries.length > 0) {
        await fs.mkdir(`${trashBase}/history`);
        for (const hts of histEntries) {
          const srcDir = `${p.history}/${hts}`;
          const dstDir = `${trashBase}/history/${hts}`;
          await fs.mkdir(dstDir);
          for (const file of ['index.html', 'style.css', 'script.js'] as const) {
            const src = `${srcDir}/${file}`;
            if (await fs.exists(src)) await fs.copy(src, `${dstDir}/${file}`);
          }
        }
      }
      await fs.remove(p.base);
      await deleteMetaRow(name);

      // 휴지통도 오래된 것부터 최근 HISTORY_LIMIT 개만 유지
      const trashEntries = await fs.list(`${ROOT}/.trash`).catch(() => [] as string[]);
      const sorted = trashEntries
        .map(e => ({ e, ts: Number(e.slice(e.lastIndexOf('-') + 1)) }))
        .filter(x => !Number.isNaN(x.ts))
        .sort((a, b) => a.ts - b.ts);
      if (sorted.length > HISTORY_LIMIT) {
        const drop = sorted.slice(0, sorted.length - HISTORY_LIMIT);
        for (const d of drop) await fs.remove(`${ROOT}/.trash/${d.e}`);
      }
    },

    async listTrash(): Promise<TrashEntry[]> {
      const trashDir = `${ROOT}/.trash`;
      const folders = await fs.list(trashDir).catch(() => [] as string[]);
      const out: TrashEntry[] = [];
      for (const folder of folders) {
        const idx = folder.lastIndexOf('-');
        const ts = idx >= 0 ? Number(folder.slice(idx + 1)) : NaN;
        const name = !Number.isNaN(ts) ? folder.slice(0, idx) : folder;
        const deletedAt = Number.isNaN(ts) ? 0 : ts;
        let displayName = name;
        let icon: string | undefined;
        const metaPath = `${trashDir}/${folder}/meta.json`;
        if (await fs.exists(metaPath)) {
          const raw = JSON.parse(await fs.read(metaPath));
          displayName = typeof raw?.displayName === 'string' ? raw.displayName : name;
          icon = typeof raw?.icon === 'string' ? raw.icon : undefined;
        }
        out.push({ folder, name, displayName, icon, deletedAt });
      }
      return out.sort((a, b) => b.deletedAt - a.deletedAt);
    },

    async restoreFromTrash(folder: string) {
      const trashBase = `${ROOT}/.trash/${folder}`;
      if (!(await fs.exists(trashBase))) {
        throw new Error(`trash entry not found: ${folder}`);
      }
      const idx = folder.lastIndexOf('-');
      const origName = idx >= 0 ? folder.slice(0, idx) : folder;

      // 이름 충돌 시 <name>-restored, <name>-restored-2 ... 순으로 빈 이름을 찾는다
      let name = origName;
      if (await fs.exists(paths(name).base)) {
        name = `${origName}-restored`;
        let n = 2;
        while (await fs.exists(paths(name).base)) {
          name = `${origName}-restored-${n}`;
          n++;
        }
      }

      const p = paths(name);
      // fs.copy 는 Capacitor Filesystem.copy 직결이라 대상 디렉터리를 만들어주지
      // 않는다. 복원 대상 폴더는 아직 없으므로 먼저 만들어야 한다 (backup() 과 동일).
      // fs.copy 는 Capacitor Filesystem.copy 직결이라 대상 디렉터리를 만들어주지
      // 않는다. 복원 대상 폴더는 아직 없으므로 먼저 만들어야 한다 (backup() 과 동일).
      await fs.mkdir(p.base);
      for (const file of ['index.html', 'style.css', 'script.js'] as const) {
        const src = `${trashBase}/${file}`;
        if (await fs.exists(src)) await fs.copy(src, `${p.base}/${file}`);
      }

      const metaPath = `${trashBase}/meta.json`;
      const now = uniqueTs();
      let meta: DomainMeta;
      if (await fs.exists(metaPath)) {
        meta = migrateMeta(JSON.parse(await fs.read(metaPath)), name);
      } else {
        meta = { schemaVersion: DOMAIN_META_VERSION, name, displayName: name, createdAt: now, updatedAt: now };
      }
      meta.name = name;
      meta.updatedAt = now;
      await fs.write(p.meta, JSON.stringify(meta, null, 2));

      // history 스냅샷도 함께 되돌린다
      const histSrc = `${trashBase}/history`;
      const histEntries = await fs.list(histSrc).catch(() => [] as string[]);
      if (histEntries.length > 0) {
        await fs.mkdir(p.history);
        for (const hts of histEntries) {
          const srcDir = `${histSrc}/${hts}`;
          const dstDir = `${p.history}/${hts}`;
          await fs.mkdir(dstDir);
          for (const file of ['index.html', 'style.css', 'script.js'] as const) {
            const src = `${srcDir}/${file}`;
            if (await fs.exists(src)) await fs.copy(src, `${dstDir}/${file}`);
          }
        }
      }

      await upsertMeta(meta);
      await fs.remove(trashBase);
    },

    async purgeTrash(folder?: string) {
      if (folder) {
        await fs.remove(`${ROOT}/.trash/${folder}`);
      } else {
        await fs.remove(`${ROOT}/.trash`);
      }
    },
  };
}

export type Domains = ReturnType<typeof createDomains>;
