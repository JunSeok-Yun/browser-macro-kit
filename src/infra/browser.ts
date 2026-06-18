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

const SLOT_RESOLUTIONS: [number, number][] = [
  [1920, 1080],[1366, 768],[1536, 864],[1440, 900],
  [1280, 720],[1600, 900],[1280, 800],[1920, 1200],
  [2560, 1440],[1360, 768],[1366, 900],[1680, 1050],
  [1280, 1024],[1400, 1050],[1600, 1200],[1440, 810],
  [2560, 1080],[1280, 960],[1440, 960],[3840, 2160]
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

export async function createPersistentContext(proxy: ProxyEntry, profileDir: string, slot: number = 0): Promise<BrowserContext> {
  const [w, h] = SLOT_RESOLUTIONS[slot % SLOT_RESOLUTIONS.length];

    // 슬롯별 결정적 해시 — 같은 슬롯은 항상 동일한 지문, 슬롯 간에는 서로 다른 지문
  const hash = (((slot + 1) * 0x9E3779B9) >>> 0);
  const noiseDelta = (hash & 1) ? 1 : -1;           // +1 또는 -1
  const noiseChannel = hash % 3;                      // R(0)/G(1)/B(2) — 알파 제외
  const noisePixelFrac = ((hash >>> 4) % 100) / 100; // 수정할 픽셀 위치 비율 (0.00~0.99)
  const audioNoise = noiseDelta * 1e-7;               // 청각적으로 감지 불가 수준

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: ENV.HEADLESS,
    channel: "chrome",
    proxy: { server: `http://${proxy.host}:${proxy.port}` },
    viewport: null,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    args: [
      `--window-size=${w},${h}`,
      "--disable-blink-features=AutomationControlled",
      "--remote-debugging-port=0",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-popup-blocking",
      "--disable-dev-shm-usage"
    ],
  });

  await context.addInitScript(
    ({ w, h, noiseDelta, noiseChannel, noisePixelFrac, audioNoise }: {
      w: number; h: number; noiseDelta: number; noiseChannel: number;
      noisePixelFrac: number; audioNoise: number;
        }) => {
      (window as any).__initStep__ = "start";
      // ── 창 크기 정합성 ──
      try {
        Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
        Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight });
      } catch (e) { (window as any).__initStep__ = "outerWidth-failed:" + String(e); }
      if (!(window as any).__initStep__.includes("failed")) (window as any).__initStep__ = "after-outerWidth";
      try {
        Object.defineProperty(window.screen, "width",       { get: () => w, configurable: true });
        Object.defineProperty(window.screen, "height",      { get: () => h, configurable: true });
        Object.defineProperty(window.screen, "availWidth",  { get: () => w, configurable: true });
        Object.defineProperty(window.screen, "availHeight", { get: () => h - 40, configurable: true });
      } catch (_) {}

      // ── WebRTC IP 누수 방지 ──
      const OrigRTC = (window as any).RTCPeerConnection;
      if (OrigRTC) {
        (window as any).RTCPeerConnection = function (cfg: any) {
          return new OrigRTC(cfg ? { ...cfg, iceServers: [] } : undefined);
        };
        (window as any).RTCPeerConnection.prototype = OrigRTC.prototype;
        Object.assign((window as any).RTCPeerConnection, OrigRTC);
      }

      function applyNoise(buf: Uint8ClampedArray, length: number): void {
        const pixelIdx = Math.floor(noisePixelFrac * (length / 4)) * 4;
        const idx = pixelIdx + noiseChannel;
        if (idx < length) buf[idx] = (buf[idx] + noiseDelta + 256) % 256;
      }

      // ── Canvas 지문 노이즈 ──
      try {
        const ORIG_GET_IMAGE_DATA = CanvasRenderingContext2D.prototype.getImageData;
        const ORIG_TO_DATA_URL    = HTMLCanvasElement.prototype.toDataURL;

        const noisedGetImageData = function (this: CanvasRenderingContext2D, x: number, y: number, sw: number, sh: number) {
          const data = ORIG_GET_IMAGE_DATA.apply(this, [x, y, sw, sh] as any);
          applyNoise(data.data, data.data.length);
          return data;
        };
        const noisedToDataURL = function (this: HTMLCanvasElement, type?: string, quality?: any) {
          if (this.width === 0 || this.height === 0)
            return ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          const ctx = this.getContext("2d") as any;
          if (!ctx) return ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          const pixelX = Math.floor(noisePixelFrac * this.width);
          const pixelY = Math.floor(this.height / 2);
          const saved  = ORIG_GET_IMAGE_DATA.call(ctx, pixelX, pixelY, 1, 1);
          const mod    = new ImageData(new Uint8ClampedArray(saved.data), 1, 1);
          if (saved.data[3] > 0) {
              mod.data[noiseChannel] = (saved.data[noiseChannel] + noiseDelta + 256) % 256;
          } else {
              mod.data[3] = 1;  // 투명 픽셀이면 alpha를 1로 설정해 premultiplied 소실 방지
          }
          ctx.putImageData(mod, pixelX, pixelY);
          const url = ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          ctx.putImageData(saved, pixelX, pixelY);
          return url;
        };

        // 1차 시도: Object.defineProperty (writable:false 우회)
        try {
          Object.defineProperty(CanvasRenderingContext2D.prototype, "getImageData", { value: noisedGetImageData, writable: true, configurable: true });
          Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL",            { value: noisedToDataURL,    writable: true, configurable: true });
          (window as any).__canvasPatchMethod__ = "defineProperty";
        } catch (_) {
          // 2차 시도: getContext Proxy (configurable:false 우회)
          const ORIG_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;
          Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
            value: function (type: string, ...args: any[]) {
              const ctx = ORIG_GET_CONTEXT.apply(this, [type, ...args] as any);
              if (type === "2d" && ctx) {
                return new Proxy(ctx, {
                  get(target: any, prop: string) {
                    if (prop === "getImageData") return noisedGetImageData.bind(target);
                    const val = target[prop];
                    return typeof val === "function" ? val.bind(target) : val;
                  }
                });
              }
              return ctx;
            },
            writable: true, configurable: true,
          });
          Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", { value: noisedToDataURL, writable: true, configurable: true });
          (window as any).__canvasPatchMethod__ = "proxy";
        }
      } catch (e) {
        (window as any).__canvasPatchMethod__ = "failed:" + String(e);
      }



      // ── WebGL readPixels 노이즈 ──
      try {
        function patchReadPixels(proto: any): void {
          if (!proto?.readPixels) return;
          const orig = proto.readPixels;
          proto.readPixels = function (...args: any[]) {
            orig.apply(this, args);
            const pixels = args[6];
            if (pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) {
              applyNoise(pixels as Uint8ClampedArray, pixels.length);
            }
          };
        }
        patchReadPixels(WebGLRenderingContext.prototype);
        patchReadPixels((window as any).WebGL2RenderingContext?.prototype);
      } catch (_) {}

      // ── AudioBuffer 노이즈 ──
      try {
        const origGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function (channel: number) {
          const data = origGetChannelData.call(this, channel);
          if (data.length > 0) data[0] += audioNoise;
          return data;
        };
      } catch (_) {}
    },
    { w, h, noiseDelta, noiseChannel, noisePixelFrac, audioNoise }
  );

  return context;
}

const AKAMAI_COOKIE_NAMES = new Set([
  "_abck", "ak_bmsc",
  "bm_so", "bm_sz", "bm_s", "bm_ss", "bm_sv", "bm_sc", "bm_lso",
]);

/** 세션 종료 시 쿠팡 방문자 쿠키 삭제 — Akamai 쿠키는 유지해 신뢰도 보존 */
export async function clearCoupangVisitorCookies(context: BrowserContext): Promise<void> {
  const allCookies = await context.cookies();
  const cookiesToKeep = allCookies.filter(
    (c) => !c.domain.includes("coupang.com") || AKAMAI_COOKIE_NAMES.has(c.name)
  );
  await context.clearCookies();
  if (cookiesToKeep.length > 0) {
    await context.addCookies(cookiesToKeep);
  }
}
