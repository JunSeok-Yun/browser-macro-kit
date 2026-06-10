import { ENV } from "../config/env";
import * as fs from "fs";
import { getBlacklistedProxies, recordProxyResult, resetProxyStats } from "./db";

export interface ProxyEntry {
  host: string;
  port: number;
}

export class ProxyManager {
  private proxies: ProxyEntry[] = [];
  private blacklist: Set<string> = new Set();
  private filePath: string;
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

constructor(filePath: string = ENV.PROXY_FILE_PATH) {
    this.filePath = filePath;
    this.reload();
    this.loadBlacklistFromDb()
    this.watchFile();
  }

  // 파일 파싱 함수
  private reload() {
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[ProxyManager] 파일 없음: ${this.filePath}`);
      return;
    }

    const lines = fs.readFileSync(this.filePath, "utf-8").split(/\r?\n/);
    const entries: ProxyEntry[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      const [host, portStr] = line.split(":"); // {ip, port} 배열로 변환
      const port = parseInt(portStr, 10);
      if (host && !isNaN(port)) entries.push({ host, port });
    }

    this.proxies = entries;
    console.log(`[ProxyManager] 프록시 ${this.proxies.length}개 로드 완료.`);
  }

  // DB에 누적된 fail_count가 임계값 이상인 프록시를 블랙리스트에 반영
  private loadBlacklistFromDb() {
    const persisted = getBlacklistedProxies(ENV.PROXY_FAIL_THRESHOLD);
    persisted.forEach((key) => this.blacklist.add(key));
    if (persisted.size > 0) {
      console.log(`[ProxyManager] DB 기록 기반 블랙리스트 ${persisted.size}개 로드.`);
    }
  }

  // 파일 변경 감지 함수
  // fs.watch는 변경 이벤트가 연속으로 중복 발생할 수 있어서 debounce 처리
  private watchFile() {
    if (!fs.existsSync(this.filePath)) return;

    this.watcher = fs.watch(this.filePath, () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        console.log("[ProxyManager] 프록시 파일 변경 감지 → 리로드합니다.");
        this.blacklist.clear();
        this.reload();      
        resetProxyStats(); // proxy_stats 초기화 — IP 풀이 바뀌었으므로 과거 평가 무효화
        console.log("[ProxyManager] proxy_stats 초기화 완료. 새 프록시 풀로 시작합니다.");
      }, 300);
    });
  }

  // 랜덤한 프록시 반환 함수
  getRandom(): ProxyEntry | null {
    const available = this.proxies.filter((p) => !this.blacklist.has(`${p.host}:${p.port}`));
    if (available.length === 0) {
      console.error("[ProxyManager] 사용 가능한 프록시가 없습니다.");
      return null;
    }
    return available[Math.floor(Math.random() * available.length)];
  }

  // 실패 처리하기 위한 프록시 블랙리스트 추가 함수
  markFailed(proxy: ProxyEntry): ProxyEntry | null {
    const key = `${proxy.host}:${proxy.port}`;
    this.blacklist.add(key);
    recordProxyResult(proxy, true);
    console.warn(`[ProxyManager] ${key} 실패 처리. 남은 프록시: ${this.proxies.length - this.blacklist.size}개`);
    return this.getRandom();
  }

  // 성공 처리 — DB 기록만
  markSuccess(proxy: ProxyEntry): void {
    recordProxyResult(proxy, false);
  }

  // playwright 연동 함수
  toPlaywright(proxy: ProxyEntry): { server: string } {
    return { server: `http://${proxy.host}:${proxy.port}` };
  }

  get count(): number {
    return this.proxies.length - this.blacklist.size;
  }

  destroy() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watcher?.close();
  }
}
