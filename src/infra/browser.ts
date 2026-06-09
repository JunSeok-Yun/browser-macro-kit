import { ENV } from "../config/env";
import { chromium, BrowserContext } from "patchright";
import { ProxyEntry } from "../infra/proxyManager";

export async function createPersistentContext(proxy: ProxyEntry): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(ENV.USER_DATA_DIR, {
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
