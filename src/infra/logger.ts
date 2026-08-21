import * as fs from "fs";
import * as path from "path";

const PID = process.pid;
let _jobId: number | null = null;
let _logPath: string | null = null;

function kstNow(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().replace("Z", "+09:00");
}

function append(entry: Record<string, unknown>): void {
    if (!_logPath) return;
    try {
    fs.appendFileSync(
        _logPath,
        JSON.stringify({ ts: kstNow(), jobId: _jobId, pid: PID, ...entry }) + "\n",
        "utf8"
        );
    } catch {}
}

export function setJobId(jobId: number): void {
    _jobId = jobId;
    const dir = path.resolve("logs");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _logPath = path.join(dir, `job-${jobId}-pid-${PID}.jsonl`);
}

export function slotFrom(profileDir: string): number {
    return parseInt(profileDir.split(/[\\/]/).pop()?.replace("profile-", "") ?? "0", 10);
}

export function info(msg: string, extra?: Record<string, unknown>): void {
    console.log(msg);
    append({ level: "info", msg, ...extra });
}

export function warn(msg: string, extra?: Record<string, unknown>): void {
    console.warn(msg);
    append({ level: "warn", msg, ...extra });
}

export function error(msg: string, extra?: Record<string, unknown>): void {
    console.error(msg);
    append({ level: "error", msg, ...extra });
}

export function event(name: string, data?: Record<string, unknown>): void {
    append({ level: "event", event: name, ...data });
}
