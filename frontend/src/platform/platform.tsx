/**
 * Platform abstraction. The web build uses browser behaviour (downloads, no tray); the desktop
 * and Android apps use the Wails host services.
 *
 * @module
 */
import { isString } from "../lib/guards";
import { hostServices, type HostServices } from "./host";

/** Which client is running. */
type PlatformKind = "web" | "desktop" | "android";

/** Tray status pushed by the desktop app. */
interface TrayStatus {
  state: "free" | "busy";
  label: string;
  roomName: string;
}

/** Result of saving a file. */
interface SaveResult {
  saved: boolean;
  path?: string | undefined;
}

/** Capabilities of the current client. */
export interface Platform {
  kind: PlatformKind;
  version: string;
  /** Server base URL; `""` means same origin. */
  serverUrl: string;
  isApp: boolean;
  canScan: boolean;
  hasTray: boolean;
  hasAutostart: boolean;
  setServerUrl: (url: string) => Promise<void>;
  saveFile: (fileName: string, mimeType: string, data: Blob) => Promise<SaveResult>;
  scanQr: () => Promise<string>;
  updateTray: (status: TrayStatus) => Promise<void>;
  autostartEnabled: () => Promise<boolean>;
  setAutostart: (isEnabled: boolean) => Promise<void>;
  onHostEvent: (name: "tray:quick-use" | "tray:open-calendar", handler: () => void) => () => void;
}

let current: Platform | undefined;

/**
 * Detect the platform once at startup.
 *
 * @returns The platform.
 */
export async function loadPlatform(): Promise<Platform> {
  const host = hostServices();
  const info = await withTimeout(host.info(), 2000).catch(() => ({ platform: "web", version: "" }));

  const kind: PlatformKind =
    info.platform === "desktop" || info.platform === "android" ? info.platform : "web";

  const serverUrl = kind === "web" ? "" : await host.serverUrl().catch(() => "");
  current = createPlatform(kind, info.version, serverUrl, host);

  return current;
}

/**
 * Reject when a host call does not answer in time (e.g. a plain web server without the runtime).
 *
 * @param promise - The host call.
 * @param milliseconds - Time limit.
 * @returns The result.
 */
function withTimeout<Value>(promise: Promise<Value>, milliseconds: number): Promise<Value> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("host timeout")), milliseconds);
    }),
  ]);
}

/**
 * The platform detected at startup (web defaults before detection).
 *
 * @returns The platform.
 */
export function platform(): Platform {
  current ??= createPlatform("web", "", "", hostServices());

  return current;
}

/**
 * Build the platform object.
 *
 * @param kind - Client kind.
 * @param version - App version.
 * @param serverUrl - API base URL.
 * @param host - Host services.
 * @returns The platform.
 */
function createPlatform(
  kind: PlatformKind,
  version: string,
  serverUrl: string,
  host: HostServices,
): Platform {
  const isApp = kind !== "web";

  return {
    kind,
    version,
    serverUrl,
    isApp,
    canScan: kind === "android",
    hasTray: kind === "desktop",
    hasAutostart: kind === "desktop",
    setServerUrl: (url) => host.setServerUrl(url),
    saveFile: async (fileName, mimeType, data) => {
      if (!isApp) return downloadInBrowser(fileName, data);
      const result = await host.saveFile(fileName, mimeType, await blobToBase64(data));

      return { saved: result.saved, path: result.path };
    },
    scanQr: () => host.scanQr(),
    updateTray: async (status) => {
      if (kind === "desktop") await host.updateTray(status);
    },
    autostartEnabled: () => (kind === "desktop" ? host.autostartEnabled() : Promise.resolve(false)),
    setAutostart: (isEnabled) => host.setAutostart(isEnabled),
    onHostEvent: (name, handler) => (kind === "desktop" ? host.onEvent(name, handler) : () => undefined),
  };
}

/**
 * Trigger a browser download.
 *
 * @param fileName - Suggested file name.
 * @param data - File content.
 * @returns Always saved (the browser handles the rest).
 */
function downloadInBrowser(fileName: string, data: Blob): SaveResult {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);

  return { saved: true };
}

/**
 * Encode a blob as base64 (without the data URL prefix).
 *
 * @param data - The blob.
 * @returns Base64 text.
 */
function blobToBase64(data: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = isString(reader.result) ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("读取文件失败")));
    reader.readAsDataURL(data);
  });
}
