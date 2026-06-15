import * as fs from "fs";
import * as path from "path";
import { ENV } from "../config/env";
import { chromium, BrowserContext } from "patchright";
import { ProxyEntry } from "../infra/proxyManager";

// Chrome 프로필 내 캐시성 폴더 — _abck 등 추적 쿠키/스토리지(Cookies, Local Storage 등)는 제외
const CACHE_DIRS = [
  "Default/Cache",
  "Default/Code Cache",
  "Default/GPUCache",
  "Default/DawnCache",
  "Default/DawnGraphiteCache",
  "Default/Service Worker/CacheStorage",
  "Default/Service Worker/ScriptCache",
  "GrShaderCache",
  "ShaderCache",
];

/** 세션 종료 시 호출 — 추적 쿠키는 보존한 채 캐시 폴더만 비워 디스크 누적을 방지 */
export function clearProfileCache(profileDir: string): void {
  for (const rel of CACHE_DIRS) {
    try {
      fs.rmSync(path.join(profileDir, rel), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch (err) {
      console.warn(`[프로필] 캐시 폴더 삭제 실패 (${rel}):`, err);
    }
  }
}

export async function createPersistentContext(proxy: ProxyEntry, profileDir: string): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: ENV.HEADLESS,
    channel: "chrome",
    proxy: { server: `http://${proxy.host}:${proxy.port}` },
    viewport: null,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--remote-debugging-port=0",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-popup-blocking",
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
    Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight });
    const OrigRTC = window.RTCPeerConnection;
    if (OrigRTC) {
      (window as any).RTCPeerConnection = function (cfg: any) {
        return new OrigRTC(cfg ? { ...cfg, iceServers: [] } : undefined);
      };
      (window as any).RTCPeerConnection.prototype = OrigRTC.prototype;
      Object.assign((window as any).RTCPeerConnection, OrigRTC);
    }
  });

  return context;
}
