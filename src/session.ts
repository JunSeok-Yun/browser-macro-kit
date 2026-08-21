import * as fs from "fs";
import { ENV } from "./config/env";
import { createPersistentContext, createIncognitoContext, clearProfileCache, profileDirForSlot } from "./infra/browser";
import { runPortalGateway } from "./gateway";
import { ProductNotFoundError, BlockDetectedError, NoLinkFoundError } from "./core/errors";
import { BLOCK_RECOVERY, RecoveryPolicy } from "./core/recovery";
import { ProxyEntry } from "./infra/proxyManager";
import { logBlock, acquireProfileSlot, releaseProfileSlot, checkAndResetSessionCount, acquireProxy, releaseProxy, failProxy } from "./infra/db";
import { ProductTarget } from "./core/types";
import { BrowserContext } from "patchright";
import { sleep } from "./utils";
import * as logger from "./infra/logger";
import { attachNetworkCapture } from "./infra/networkCapture";

const SLOT_RETRY_DELAY_MS = 5000;
let _firstSessionDone = false;

async function acquireProfileSlotWithRetry(): Promise<number> {
    while (true) {
        const slot = await acquireProfileSlot(ENV.PROFILE_LOCK_STALE_MS);
        if (slot !== null) return slot;
        logger.warn("[세션] 모든 프로필 슬롯 사용 중. 5초 후 재시도...");
        await sleep(SLOT_RETRY_DELAY_MS);
    }
}

async function acquireProxyWithRetry(): Promise<ProxyEntry> {
    while (true) {
        const proxy = await acquireProxy(ENV.PROXY_LOCK_STALE_MS, ENV.PROXY_FAIL_THRESHOLD);
        if (proxy !== null) return proxy;
        logger.warn("[세션] 사용 가능한 프록시 없음. 5초 후 재시도...");
        await sleep(SLOT_RETRY_DELAY_MS);
    }
}

async function applyRecoveryPolicy(
    policy: RecoveryPolicy,
    proxy: ProxyEntry,
    profileDir: string,
): Promise<ProxyEntry> {
    if (policy.rotateProxy) {
        await failProxy(proxy.host, proxy.port);
        proxy = await acquireProxyWithRetry();
    }
    if (policy.rotateProfile) {
        try {
            fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
        } catch (err) {
            logger.warn(`[세션] 프로필 폴더 삭제 실패 (${profileDir}): ${String(err)}`);
        }
    }
    if (policy.extraDelayMs) {
        await sleep(policy.extraDelayMs);
    }
    return proxy;
}

export async function runSession(
    target: ProductTarget,
    jobId: number
): Promise<boolean> {
    const usedQueries = new Set<string>();
    let success = false;
    const useIncognito = Math.random() < ENV.INCOGNITO_RATIO;
    const channel = (useIncognito ? "chrome"
        : (Math.random() < ENV.EDGE_RATIO ? "msedge" : "chrome")) as "chrome" | "msedge";
    const slot = await acquireProfileSlotWithRetry();
    const profileDir = profileDirForSlot(slot);
    let proxy = await acquireProxyWithRetry();
    let httpErrorStreak = 0;

    logger.info(`[세션] 모드: ${useIncognito ? "시크릿" : `영구(${channel})`}, slot: ${slot}`, {
        event: "SESSION_MODE", useIncognito, channel, slot,
    });

    if (!_firstSessionDone) {
        const staggerMs = (slot % 20) * 1500 + 2000 + Math.floor(Math.random() * 300);
        logger.info(`[세션] 슬롯 ${slot}: 시차 대기 ${staggerMs}ms`, {
            event: "SESSION_STAGGER", slot, staggerMs,
        });
        await sleep(staggerMs);
        _firstSessionDone = true;
    } else {
        await sleep(Math.floor(Math.random() * 3000) + 1000);
    }

    try {
        for (let i = 1; i <= ENV.MAX_RETRY; i++) {
            logger.info(
                `[메인] 시도 ${i}/${ENV.MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}, 프로필: profile-${slot}`,
                { event: "SESSION_ATTEMPT", attempt: i, maxRetry: ENV.MAX_RETRY, proxy: `${proxy.host}:${proxy.port}`, slot }
            );

            let context: BrowserContext;
            let chromePid: number | null = null;
            let tempDir: string | null = null;

            if (useIncognito) {
                const result = await createIncognitoContext(proxy, slot);
                context = result.context;
                chromePid = result.chromePid;
                tempDir = result.tempDir;
            } else {
                const result = await createPersistentContext(proxy, profileDir, slot, channel);
                context = result.context;
                chromePid = result.chromePid;
            }
            const page = context.pages()[0] ?? await context.newPage();
            const flushNetworkLog = attachNetworkCapture(context, slot);

            let pendingPolicy: RecoveryPolicy | null = null;
            let exhausted = false;

            try {
                const result = await runPortalGateway(page, target, usedQueries, proxy, profileDir, jobId);
                if (result) {
                    logger.info("[메인] 쿠팡 진입 성공!", {
                        event: "SESSION_SUCCESS", proxy: `${proxy.host}:${proxy.port}`, slot,
                    });
                    success = true;
                } else {
                    logger.warn(`[메인] 쿠팡 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`, {
                        event: "PORTAL_FAIL", proxy: `${proxy.host}:${proxy.port}`, slot,
                    });
                    await failProxy(proxy.host, proxy.port);
                    proxy = await acquireProxyWithRetry();
                }
            } catch (error) {
                if (error instanceof ProductNotFoundError) {
                    error.usedQueries.forEach(q => usedQueries.add(q));
                    logger.error(`[메인] 모든 검색 쿼리 소진. 종료합니다.`, {
                        event: "QUERIES_EXHAUSTED", usedQueries: [...error.usedQueries], slot,
                    });
                    exhausted = true;
                } else if (error instanceof NoLinkFoundError) {
                    logger.warn(`[메인] ${error.message}`, {
                        event: "NO_LINK", proxy: `${proxy.host}:${proxy.port}`, slot,
                    });
                } else if (error instanceof BlockDetectedError) {
                    logger.error(`[메인] 차단 감지 (${error.type}): ${error.message}`, {
                        event: "BLOCK_DETECTED", blockType: error.type,
                        proxy: `${proxy.host}:${proxy.port}`, slot, htmlPath: error.htmlPath ?? null,
                    });
                    await logBlock(proxy, error.type, error.message, error.htmlPath, profileDir);
                    if (error.type === "HTTP_ERROR") {
                        httpErrorStreak++;
                        if (httpErrorStreak >= ENV.HTTP_ERROR_THRESHOLD) {
                            await failProxy(proxy.host, proxy.port);
                            proxy = await acquireProxyWithRetry();
                            httpErrorStreak = 0;
                        }
                    } else {
                        pendingPolicy = BLOCK_RECOVERY[error.type];
                    }
                } else {
                    logger.error(`[메인] 시도 ${i} 중 에러 발생: ${String(error)}`, {
                        event: "UNKNOWN_ERROR", attempt: i,
                        proxy: `${proxy.host}:${proxy.port}`, slot, errorMessage: String(error),
                    });
                    await failProxy(proxy.host, proxy.port);
                    proxy = await acquireProxyWithRetry();
                }
            } finally {
                flushNetworkLog();
                await context.close();
                if (chromePid) { try { process.kill(chromePid); } catch {} }
                if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} }
            }

            if (success || exhausted) break;
            if (pendingPolicy) {
                if (useIncognito) {
                    if (pendingPolicy.rotateProxy) {
                        await failProxy(proxy.host, proxy.port);
                        proxy = await acquireProxyWithRetry();
                    }
                    if (pendingPolicy.extraDelayMs) await sleep(pendingPolicy.extraDelayMs);
                } else {
                    proxy = await applyRecoveryPolicy(pendingPolicy, proxy, profileDir);
                }
            }
        }
    } finally {
        await releaseProxy(proxy.host, proxy.port).catch(() => {});
        if (!useIncognito) clearProfileCache(profileDir);
        await releaseProfileSlot(slot, !useIncognito);
        if (!useIncognito) {
            const needsReset = await checkAndResetSessionCount(slot, ENV.PROFILE_RESET_THRESHOLD);
            if (needsReset) {
                try {
                    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
                    logger.info(`[세션] profile-${slot} ${ENV.PROFILE_RESET_THRESHOLD}회 도달 → 프로필 초기화`, {
                        event: "PROFILE_RESET_BY_COUNT", slot,
                    });
                } catch (err) {
                    logger.warn(`[세션] 프로필 초기화 실패: ${String(err)}`);
                }
            }
        }
    }

    if (!success) {
        logger.error(`[메인] ${ENV.MAX_RETRY}회 시도 모두 실패. 세션을 종료합니다.`, {
            event: "SESSION_FAIL", maxRetry: ENV.MAX_RETRY, slot,
        });
    }

    return success;
}
