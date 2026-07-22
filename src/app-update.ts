import { getVersion } from "@tauri-apps/api/app";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { compareAppVersions, normalizeAppVersion } from "./app-version";

const RELEASES_API = "https://api.github.com/repos/NibinNaug/ESE-Electrical-Schemes-Editor/releases?per_page=30";
const ANDROID_APK_NAME = "ESE-Android-Universal.apk";

type GitHubAsset = {
  name: string;
  browser_download_url: string;
  digest?: string | null;
  size?: number;
};

type GitHubRelease = {
  draft: boolean;
  tag_name: string;
  body?: string | null;
  published_at?: string | null;
  html_url: string;
  assets: GitHubAsset[];
};

type AndroidUpdateBridge = {
  downloadAndInstallUpdate: (requestId: string, url: string, sha256: string) => void;
};

type AndroidUpdateEvent = {
  requestId: string;
  state: "download-started" | "download-progress" | "download-finished" | "verifying" | "permission-required" | "installer-opened" | "error";
  message?: string;
  downloaded?: number;
  total?: number;
};

type DesktopUpdateMetadata = {
  version: string;
  currentVersion: string;
  body?: string | null;
  date?: string | null;
};

type DesktopDownloadEvent =
  | { event: "started"; data: { contentLength: number | null } }
  | { event: "progress"; data: { chunkLength: number } }
  | { event: "finished" };

export type AppUpdateInfo = {
  platform: "android" | "desktop";
  currentVersion: string;
  version: string;
  notes: string;
  publishedAt: string | null;
  releaseUrl: string;
  downloadSize: number | null;
  downloadUrl: string;
  sha256: string | null;
};

export type AppUpdateProgress = {
  phase: "downloading" | "verifying" | "permission" | "installing";
  message: string;
  downloaded: number;
  total: number | null;
};

const getAndroidUpdateBridge = (): AndroidUpdateBridge | undefined =>
  (window as Window & { ESEAndroid?: AndroidUpdateBridge }).ESEAndroid;

export const appUpdatesSupported = (): boolean => Boolean(getAndroidUpdateBridge()) || isTauri();

export const getInstalledAppVersion = async (): Promise<string> => normalizeAppVersion(await getVersion());

const fetchReleases = async (): Promise<GitHubRelease[]> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}`);
    const releases = await response.json();
    if (!Array.isArray(releases)) throw new Error("Réponse GitHub invalide");
    return releases as GitHubRelease[];
  } finally {
    window.clearTimeout(timeout);
  }
};

const newerReleases = (releases: GitHubRelease[], currentVersion: string): GitHubRelease[] =>
  releases
    .filter((release) => {
      if (release.draft) return false;
      try { return compareAppVersions(release.tag_name, currentVersion) > 0; }
      catch { return false; }
    })
    .sort((left, right) => compareAppVersions(right.tag_name, left.tag_name));

const releaseVersion = (release: GitHubRelease): string => normalizeAppVersion(release.tag_name);

const checkAndroidUpdate = (releases: GitHubRelease[], currentVersion: string): AppUpdateInfo | null => {
  for (const release of newerReleases(releases, currentVersion)) {
    const apk = release.assets.find((asset) => asset.name === ANDROID_APK_NAME);
    const sha256 = apk?.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1]?.toLowerCase();
    if (!apk || !sha256) continue;
    return {
      platform: "android",
      currentVersion,
      version: releaseVersion(release),
      notes: release.body?.trim() || "Nouvelle version d’ESE.",
      publishedAt: release.published_at || null,
      releaseUrl: release.html_url,
      downloadSize: typeof apk.size === "number" ? apk.size : null,
      downloadUrl: apk.browser_download_url,
      sha256
    };
  }
  return null;
};

const checkDesktopUpdate = async (releases: GitHubRelease[], currentVersion: string): Promise<AppUpdateInfo | null> => {
  for (const release of newerReleases(releases, currentVersion)) {
    const manifest = release.assets.find((asset) => asset.name === "latest.json");
    if (!manifest) continue;
    const metadata = await invoke<DesktopUpdateMetadata | null>("check_desktop_update", {
      endpoint: manifest.browser_download_url
    });
    if (!metadata) return null;
    return {
      platform: "desktop",
      currentVersion: normalizeAppVersion(metadata.currentVersion),
      version: normalizeAppVersion(metadata.version),
      notes: metadata.body?.trim() || release.body?.trim() || "Nouvelle version d’ESE.",
      publishedAt: metadata.date || release.published_at || null,
      releaseUrl: release.html_url,
      downloadSize: null,
      downloadUrl: manifest.browser_download_url,
      sha256: null
    };
  }
  return null;
};

export const checkForAppUpdate = async (): Promise<{ currentVersion: string; update: AppUpdateInfo | null }> => {
  if (!appUpdatesSupported()) throw new Error("Les mises à jour intégrées ne sont disponibles que dans l’application ESE.");
  const currentVersion = await getInstalledAppVersion();
  const releases = await fetchReleases();
  const update = getAndroidUpdateBridge()
    ? checkAndroidUpdate(releases, currentVersion)
    : await checkDesktopUpdate(releases, currentVersion);
  return { currentVersion, update };
};

const installAndroidUpdate = (
  update: AppUpdateInfo,
  onProgress: (progress: AppUpdateProgress) => void
): Promise<void> => new Promise((resolve, reject) => {
  const bridge = getAndroidUpdateBridge();
  if (!bridge || !update.sha256) return reject(new Error("Passerelle de mise à jour Android indisponible."));
  const requestId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timeout = window.setTimeout(() => finish(new Error("La mise à jour Android a expiré.")), 30 * 60_000);

  const finish = (error?: Error): void => {
    window.clearTimeout(timeout);
    window.removeEventListener("ese-update", listener);
    if (error) reject(error);
    else resolve();
  };

  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AndroidUpdateEvent>).detail;
    if (!detail || detail.requestId !== requestId) return;
    const downloaded = detail.downloaded || 0;
    const total = detail.total && detail.total > 0 ? detail.total : null;
    if (detail.state === "download-started" || detail.state === "download-progress") {
      onProgress({ phase: "downloading", message: detail.message || "Téléchargement de la mise à jour…", downloaded, total });
    } else if (detail.state === "download-finished" || detail.state === "verifying") {
      onProgress({ phase: "verifying", message: detail.message || "Vérification de l’APK…", downloaded, total });
    } else if (detail.state === "permission-required") {
      onProgress({ phase: "permission", message: detail.message || "Autorise ESE à installer la mise à jour, puis reviens dans l’application.", downloaded, total });
    } else if (detail.state === "installer-opened") {
      onProgress({ phase: "installing", message: detail.message || "Programme d’installation Android ouvert.", downloaded, total });
      finish();
    } else if (detail.state === "error") {
      finish(new Error(detail.message || "Mise à jour Android impossible."));
    }
  };

  window.addEventListener("ese-update", listener);
  try { bridge.downloadAndInstallUpdate(requestId, update.downloadUrl, update.sha256); }
  catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
});

const installDesktopUpdate = async (onProgress: (progress: AppUpdateProgress) => void): Promise<void> => {
  let downloaded = 0;
  let total: number | null = null;
  const events = new Channel<DesktopDownloadEvent>();
  events.onmessage = (event) => {
    if (event.event === "started") {
      total = event.data.contentLength && event.data.contentLength > 0 ? event.data.contentLength : null;
      onProgress({ phase: "downloading", message: "Téléchargement de la mise à jour…", downloaded, total });
    } else if (event.event === "progress") {
      downloaded += event.data.chunkLength;
      onProgress({ phase: "downloading", message: "Téléchargement de la mise à jour…", downloaded, total });
    } else {
      onProgress({ phase: "installing", message: "Mise à jour vérifiée. Installation et redémarrage…", downloaded, total });
    }
  };
  await invoke("install_desktop_update", { onEvent: events });
};

export const installAppUpdate = async (
  update: AppUpdateInfo,
  onProgress: (progress: AppUpdateProgress) => void
): Promise<void> => {
  if (update.platform === "android") return installAndroidUpdate(update, onProgress);
  return installDesktopUpdate(onProgress);
};
