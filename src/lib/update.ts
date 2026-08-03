import { registerPlugin, Capacitor } from '@capacitor/core';

// ─── Native plugin binding ──────────────────────────────────────────────────
export interface ApkInstallerPlugin {
  /** 다운로드된 APK 를 OS 설치 다이얼로그로 넘긴다. */
  install(options: { path: string }): Promise<void>;
  /** 설정 → "출처를 알 수 없는 앱" 권한 상태 조회. Android 8+ 에서 필수. */
  canInstall(): Promise<{ allowed: boolean }>;
  /** 권한이 없으면 시스템 설정 화면을 연다. */
  requestInstallPermission(): Promise<void>;
}

export const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

// ─── Version / release model ────────────────────────────────────────────────
export const APP_VERSION: string =
  // Vite define. 런타임 폴백은 개발 환경(브라우저) 용.
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export interface ReleaseInfo {
  tag: string;         // 예: "v1.2.3"
  version: string;     // 예: "1.2.3"
  notes: string;
  apkUrl: string;
  apkSize: number;
  publishedAt: string;
}

/** "v1.2.3" | "1.2.3" → "1.2.3" */
function normalize(v: string): string {
  return v.trim().replace(/^v/i, '');
}

/** semver 비교. a>b → 1, a<b → -1, equal → 0. 프리릴리즈 태그는 무시. */
export function compareVersions(a: string, b: string): number {
  const pa = normalize(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = normalize(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// ─── GitHub Releases ────────────────────────────────────────────────────────
function getRepo(): string | null {
  const r = import.meta.env.VITE_UPDATE_REPO;
  return r && /^[^/\s]+\/[^/\s]+$/.test(r) ? r : null;
}

export function isConfigured(): boolean {
  return getRepo() !== null;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const repo = getRepo();
  if (!repo) return null;
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null; // 아직 릴리즈가 없음
  if (!r.ok) throw new Error(`GitHub API ${r.status}`);
  const d = await r.json();
  const asset = (d.assets ?? []).find((a: any) => typeof a.name === 'string' && a.name.endsWith('.apk'));
  if (!asset) return null;
  return {
    tag: d.tag_name,
    version: normalize(d.tag_name),
    notes: d.body ?? '',
    apkUrl: asset.browser_download_url,
    apkSize: asset.size ?? 0,
    publishedAt: d.published_at,
  };
}

export interface UpdateCheck {
  configured: boolean;
  current: string;
  latest?: ReleaseInfo;
  hasUpdate: boolean;
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = APP_VERSION;
  if (!isConfigured()) return { configured: false, current, hasUpdate: false };
  const latest = await fetchLatestRelease();
  if (!latest) return { configured: true, current, hasUpdate: false };
  return {
    configured: true,
    current,
    latest,
    hasUpdate: compareVersions(latest.version, current) > 0,
  };
}

// ─── Download + install ─────────────────────────────────────────────────────
export interface DownloadProgress { received: number; total: number; }

/**
 * APK 를 앱의 external cache 로 다운로드하고 절대 경로를 반환.
 * fetch + streaming reader 사용 — Capacitor Filesystem 은 큰 바이너리에 부적합해서 커스텀 처리.
 */
export async function downloadApk(
  url: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  if (Capacitor.getPlatform() !== 'android') {
    throw new Error('APK 설치는 Android 에서만 가능합니다');
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');

  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`다운로드 실패: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length') ?? 0);
  const reader = r.body.getReader();

  const relPath = `updates/app-latest.apk`;
  // 기존 파일 지우기 (append 시작을 위해)
  try { await Filesystem.deleteFile({ path: relPath, directory: Directory.Cache }); } catch { /* first run */ }
  // 디렉토리 준비
  try { await Filesystem.mkdir({ path: 'updates', directory: Directory.Cache, recursive: true }); } catch { /* exists */ }

  let received = 0;
  let firstChunk = true;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const b64 = bytesToB64(value);
    await Filesystem.writeFile({
      path: relPath,
      directory: Directory.Cache,
      data: b64,
      recursive: true,
      // 첫 청크는 새로 만들고, 이후는 append. Capacitor 6 는 append 지원.
      // (fallback 이 필요하면 전체 buffer 로 한 번에 쓰는 방법도 있음)
      ...(firstChunk ? {} : { append: true } as any),
    });
    firstChunk = false;
    received += value.byteLength;
    onProgress?.({ received, total });
  }
  const stat = await Filesystem.stat({ path: relPath, directory: Directory.Cache });
  return stat.uri; // file:// URI — 네이티브 플러그인이 이걸 받아 File 로 변환
}

function bytesToB64(bytes: Uint8Array): string {
  // 큰 청크에서 apply(...) 스택 오버 방지: 32KB 씩 잘라서
  const CHUNK = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

/**
 * 최신 릴리즈를 다운로드하고 설치 다이얼로그를 띄운다.
 * 사용자가 승인해서 설치가 시작되면 앱 프로세스는 새 APK 설치 후 재시작된다.
 */
export async function downloadAndInstall(
  release: ReleaseInfo,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const perm = await ApkInstaller.canInstall();
  if (!perm.allowed) {
    await ApkInstaller.requestInstallPermission();
    throw new Error('설치 권한을 허용한 뒤 다시 시도해 주세요');
  }
  const uri = await downloadApk(release.apkUrl, onProgress);
  await ApkInstaller.install({ path: uri });
}
