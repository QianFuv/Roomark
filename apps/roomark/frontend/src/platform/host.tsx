/**
 * Thin adapter over the Wails host services (generated bindings in `frontend/bindings`).
 *
 * @module
 */
import { Events } from "@wailsio/runtime";

import {
  AutostartService,
  FileService,
  PlatformService,
  ScanService,
  TrayService,
} from "../../bindings/roomark/apps/roomark/index";

/** Host services as the frontend uses them. */
export interface HostServices {
  info: () => Promise<{ platform: string; version: string }>;
  serverUrl: () => Promise<string>;
  setServerUrl: (url: string) => Promise<void>;
  saveFile: (
    fileName: string,
    mimeType: string,
    base64Data: string,
  ) => Promise<{ saved: boolean; path?: string | undefined }>;
  scanQr: () => Promise<string>;
  updateTray: (status: { state: string; label: string; roomName: string }) => Promise<void>;
  autostartEnabled: () => Promise<boolean>;
  setAutostart: (isEnabled: boolean) => Promise<void>;
  onEvent: (name: string, handler: () => void) => () => void;
}

/**
 * Host services for the running build. Outside a Wails host (plain browser, tests) the calls
 * reject, and the platform falls back to web behaviour.
 *
 * @returns The services.
 */
export function hostServices(): HostServices {
  return {
    info: () => PlatformService.Info(),
    serverUrl: () => PlatformService.ServerURL(),
    setServerUrl: (url) => PlatformService.SetServerURL(url),
    saveFile: (fileName, mimeType, base64Data) => FileService.SaveFile(fileName, mimeType, base64Data),
    scanQr: () => ScanService.ScanQR(),
    updateTray: (status) => TrayService.Update(status),
    autostartEnabled: () => AutostartService.Enabled(),
    setAutostart: (isEnabled) => AutostartService.SetEnabled(isEnabled),
    onEvent: (name, handler) => Events.On(name, () => handler()),
  };
}
