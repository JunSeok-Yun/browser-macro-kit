import * as fs from "fs";
import * as path from "path";
import { ENV } from "./config/env";
import { DEFAULT_TARGET } from "./config/target";
import { createPersistentContext, clearProfileCache, clearCoupangVisitorCookies } from "./infra/browser";
import { runPortalGateway } from "./gateway";
import { ProductNotFoundError, BlockDetectedError, NoLinkFoundError } from "./core/errors";
import { BLOCK_RECOVERY, RecoveryPolicy } from "./core/recovery";
import { ProxyManager, ProxyEntry } from "./infra/proxyManager";
import { logBlock, getRunningJob, incrementJobProgress, incrementJobFailedCount, completeJob, listenForJobCreated, acquireProfileSlot, releaseProfileSlot } from "./infra/db";
import { ProductTarget, Job } from "./core/types";
import { sleep } from "./utils";

const IDLE_POLL_MS = 30000; // NOTIFY 누락 대비 폴링 안전망
const SLOT_RETRY_DELAY_MS = 5000; // 모든 프로필 슬롯 사용 중일 때 재시도 간격

function profileDirForSlot(slot: number): string {
  return path.join(ENV.USER_DATA_ROOT, `profile-${slot}`);
}

async function acquireProfileSlotWithRetry(): Promise<number> {
  while (true) {
    const slot = await acquireProfileSlot(ENV.PROFILE_LOCK_STALE_MS);
    if (slot !== null) return slot;
    console.log("[메인] 모든 프로필 슬롯 사용 중. 5초 후 재시도...");
    await sleep(SLOT_RETRY_DELAY_MS);
  }
}

function buildTargetForCategory(category: string): ProductTarget {
  return {
    brand: DEFAULT_TARGET.brand,
    products: DEFAULT_TARGET.products.filter((p) => p.category === category),
  };
}

async function applyRecoveryPolicy(
  policy: RecoveryPolicy,
  proxy: ProxyEntry,
  profileDir: string,
  proxyManager: ProxyManager
): Promise< ProxyEntry | null> {
  if (policy.rotateProxy) {
    proxy = (await proxyManager.markFailed(proxy))!;
  }
    if (policy.rotateProfile) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch (err) {
      console.warn(`[메인] 프로필 폴더 삭제 실패 (${profileDir}):`, err);
    }
  }
  if (policy.extraDelayMs) {
    await sleep(policy.extraDelayMs);
  }
  return proxy;
}

async function main() {
  console.log("[메인] 가동 시작...");
  console.log(`[메인] 영구 프로필 경로: ${ENV.USER_DATA_ROOT}`);

  const proxyManager = await ProxyManager.create();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  let wake = () => {};
  const listenClient = await listenForJobCreated(() => wake());
  console.log("[메인] job_created 알림 대기 시작...");

  try {
    while (true) {
      let job: Job | null;
      try {
        job = await getRunningJob();
      } catch (err) {
        console.error("[메인] Job 조회 중 에러:", err);
        await sleep(IDLE_POLL_MS);
        continue;
      }

      if (!job) {
        await waitForWake();
        continue;
      }

      const target = buildTargetForCategory(job.category);
      if (target.products.length === 0) {
        console.error(`[메인] Job ${job.id}: category "${job.category}"에 해당하는 상품이 없습니다. 대기.`);
        await waitForWake();
        continue;
      }

      console.log(`[메인] Job ${job.id} (${job.category}) 진행 중 — ${job.completedCount}/${job.targetCount}`);
      const success = await runSession(proxyManager, target, job.id);

      if (success) {
        const progress = await incrementJobProgress(job.id);
        console.log(`[메인] Job ${job.id} 진행률: ${progress.completedCount}/${progress.targetCount}`);
        if (progress.completedCount >= progress.targetCount) {
          await completeJob(job.id);
          console.log(`[메인] Job ${job.id} 완료.`);
        }
      } else {
        await incrementJobFailedCount(job.id);
      }
    }
  } finally {
    await listenClient.end();
    proxyManager.destroy();
    console.log("[메인] 종료.");
  }

  function waitForWake(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, IDLE_POLL_MS);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/** 세션 1회 = 상품 탐색 1번. MAX_RETRY번까지 프록시를 바꿔가며 재시도. 성공 여부를 반환. */
async function runSession(proxyManager: ProxyManager, target: ProductTarget, jobId: number): Promise<boolean> {
  const usedQueries = new Set<string>();
  let success = false;
  let proxy = proxyManager.getRandom();
  const slot = await acquireProfileSlotWithRetry();
  const profileDir = profileDirForSlot(slot);
  let httpErrorStreak = 0 // HTTP_ERROR N회 후 프록시 교체용

  try {
    for (let i = 1; i <= ENV.MAX_RETRY; i++) {
      if (!proxy) {
        console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
        break;
      }

      console.log(`[메인] 시도 ${i}/${ENV.MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}, 프로필: profile-${slot}`);

      const context = await createPersistentContext(proxy, profileDir, slot ?? 0);
      const page = context.pages()[0] ?? await context.newPage();

      let pendingPolicy: RecoveryPolicy | null = null;
      let exhausted = false;

      try {
        const result = await runPortalGateway(page, target, usedQueries, proxy, profileDir, jobId);
        if (result) {
          console.log("[메인] 쿠팡 진입 성공!");
          await proxyManager.markSuccess(proxy!);
          success = true;
        } else {
          console.warn(`[메인] 쿠팡 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`);
          proxy = await proxyManager.markFailed(proxy);
        }
      } catch (error) {
        if (error instanceof ProductNotFoundError) {
          error.usedQueries.forEach(q => usedQueries.add(q));
          console.error(`[메인] 모든 검색 쿼리 소진. 종료합니다.`);
          exhausted = true; // 차단 아님 → 프로필/프록시 교체 불필요
        } else if (error instanceof NoLinkFoundError) {
          console.warn(`[메인] ${error.message}`);// 광고 노출 변동성 — 프록시/프로필 모두 정상, 그대로 재시도
        } else if (error instanceof BlockDetectedError) {
          console.error(`[메인] 차단 감지 (${error.type}): ${error.message}`);
          await logBlock(proxy, error.type, error.message, error.htmlPath, profileDir);

          // HTTP_ERROR는 연속 횟수 기반 정책이라 정책 테이블보다 먼저 처리
          if (error.type === "HTTP_ERROR") {
            httpErrorStreak++;
            if (httpErrorStreak >= ENV.HTTP_ERROR_THRESHOLD) {
              proxy = await proxyManager.markFailed(proxy!);
              httpErrorStreak = 0;
            }
            // 프로필 유지, 정책 적용 없음
          } else {
            pendingPolicy = BLOCK_RECOVERY[error.type];
          }
        } else {
          console.error(`[메인] 시도 ${i} 중 에러 발생:`, error);
          proxy = await proxyManager.markFailed(proxy!);
        }
      } finally {
        try {
          const cookies = await context.cookies("https://www.coupang.com");
          const lines = cookies.map(
            (c) =>
              `  ${c.name.padEnd(30)} value=${c.value.substring(0, 40).padEnd(42)} expires=${
                c.expires === -1 ? "session" : new Date(c.expires * 1000).toISOString()
              }`
          );
          const pcid = cookies.find((c) => c.name === "PCID");
          const slotLabel = `profile-${slot}`;
          const header = `[${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}] ${slotLabel}\nPCID = ${pcid?.value ?? "없음"}\n`;
          const content = header + lines.join("\n") + "\n" + "─".repeat(60) + "\n";
          if (!fs.existsSync("logs")) fs.mkdirSync("logs");
          fs.appendFileSync("logs/cookies_detail.txt", content);
        } catch {}
        await context.close();
      }
      if (success || exhausted) {
        break;
      }
      if (pendingPolicy) {
        proxy = await applyRecoveryPolicy(pendingPolicy, proxy!, profileDir, proxyManager);
      }
    }
  } finally {
    clearProfileCache(profileDir);
    await releaseProfileSlot(slot);
  }

  if (!success) {
    console.error(`[메인] ${ENV.MAX_RETRY}회 시도 모두 실패. 세션을 종료합니다.`);
  }

  return success;
}