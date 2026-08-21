import * as fs from "fs";
import { ENV } from "../config/env";
import { syncProxiesToDb } from "./db";

export interface ProxyEntry {
  host: string;
  port: number;
}

export class ProxyManager {
  private filePath: string;
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async create(filePath: string = ENV.PROXY_FILE_PATH): Promise<ProxyManager> {
    const manager = new ProxyManager(filePath);
    await manager.syncFromFile();
    manager.watchFile();
    return manager;
  }

  private parseFile(): ProxyEntry[] {
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[ProxyManager] 파일 없음: ${this.filePath}`);
      return [];
    }
    const lines = fs.readFileSync(this.filePath, "utf-8").split(/\r?\n/);
    const entries: ProxyEntry[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [host, portStr] = line.split(":");
      const port = parseInt(portStr, 10);
      if (host && !isNaN(port)) entries.push({ host, port });
    }
    return entries;
  }

  private async syncFromFile(): Promise<void> {
    const entries = this.parseFile();
    await syncProxiesToDb(entries);
    console.log(`[ProxyManager] proxy_pool 동기화 완료: ${entries.length}개`);
  }

  private watchFile(): void {
    if (!fs.existsSync(this.filePath)) return;
    let lastMtime = fs.statSync(this.filePath).mtimeMs;

    this.watcher = fs.watch(this.filePath, () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        const currentMtime = fs.statSync(this.filePath).mtimeMs;
        if (currentMtime === lastMtime) return;
        lastMtime = currentMtime;
        console.log("[ProxyManager] proxies.txt 변경 감지 → proxy_pool 전체 교체...");
        this.syncFromFile();
      }, 300);
    });
  }
}
