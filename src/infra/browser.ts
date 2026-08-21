import * as os from "os";
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

export function profileDirForSlot(slot: number): string {
  return path.join(ENV.USER_DATA_ROOT, `profile-${slot}`);
}

type Channel = "chrome" | "msedge";

async function launchContext(
  proxy: ProxyEntry,
  profileDir: string,
  slot: number,
  channel: Channel
): Promise<{ context: BrowserContext; chromePid: number | null }> {
  const [w, h] = SLOT_RESOLUTIONS[slot % SLOT_RESOLUTIONS.length];

  const hash = (((slot + 1) * 0x9E3779B9) >>> 0);
  const noiseDelta      = (hash & 1) ? 1 : -1;
  const noiseChannel    = hash % 3;
  const noisePixelFrac  = ((hash >>> 4) % 100) / 100;
  const audioNoise      = noiseDelta * 1e-7;

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: ENV.HEADLESS,
    channel,
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
      "--disk-cache-size=10485760",
    ],
  });

  await context.addInitScript(
    ({ w, h, noiseDelta, noiseChannel, noisePixelFrac, audioNoise }: {
      w: number; h: number; noiseDelta: number; noiseChannel: number;
      noisePixelFrac: number; audioNoise: number;
    }) => {
      // ↓↓↓ 기존 addInitScript 내용 그대로 유지 ↓↓↓
      (window as any).__initStep__ = "start";
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
      try {
        const ORIG_GET_IMAGE_DATA = CanvasRenderingContext2D.prototype.getImageData;
        const ORIG_TO_DATA_URL    = HTMLCanvasElement.prototype.toDataURL;
        const noisedGetImageData = function (this: CanvasRenderingContext2D, x: number, y: number, sw: number, sh: number) {
          const data = ORIG_GET_IMAGE_DATA.apply(this, [x, y, sw, sh] as any);
          applyNoise(data.data, data.data.length);
          return data;
        };
        const noisedToDataURL = function (this: HTMLCanvasElement, type?: string, quality?: any) {
          if (this.width === 0 || this.height === 0) return ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          const ctx = this.getContext("2d") as any;
          if (!ctx) return ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          const pixelX = Math.floor(noisePixelFrac * this.width);
          const pixelY = Math.floor(this.height / 2);
          const saved  = ORIG_GET_IMAGE_DATA.call(ctx, pixelX, pixelY, 1, 1);
          const mod    = new ImageData(new Uint8ClampedArray(saved.data), 1, 1);
          if (saved.data[3] > 0) {
              mod.data[noiseChannel] = (saved.data[noiseChannel] + noiseDelta + 256) % 256;
          } else {
              mod.data[3] = 1;
          }
          ctx.putImageData(mod, pixelX, pixelY);
          const url = ORIG_TO_DATA_URL.apply(this, [type, quality] as any);
          ctx.putImageData(saved, pixelX, pixelY);
          return url;
        };
        try {
          Object.defineProperty(CanvasRenderingContext2D.prototype, "getImageData", { value: noisedGetImageData, writable: true, configurable: true });
          Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL",            { value: noisedToDataURL,    writable: true, configurable: true });
          (window as any).__canvasPatchMethod__ = "defineProperty";
        } catch (_) {
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

  // chromePid 안전 추출 (Patchright에서 .process는 함수가 아닌 프로퍼티)
  let chromePid: number | null = null;
  try {
    chromePid = (context as any)._browser?.process?.pid ?? null;
  } catch { chromePid = null; }

  return { context, chromePid };
}

/** 영구 프로필 컨텍스트 */
export async function createPersistentContext(
  proxy: ProxyEntry,
  profileDir: string,
  slot: number = 0,
  channel: Channel = "chrome"
): Promise<{ context: BrowserContext; chromePid: number | null }> {
  return launchContext(proxy, profileDir, slot, channel);
}

/** 시크릿 컨텍스트 — OS 임시 폴더 사용, 세션 후 삭제 */
export async function createIncognitoContext(
  proxy: ProxyEntry,
  slot: number = 0
): Promise<{ context: BrowserContext; chromePid: number | null; tempDir: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coupang-"));
  try {
    const { context, chromePid } = await launchContext(proxy, tempDir, slot, "chrome");
    return { context, chromePid, tempDir };
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw err;
  }
}
