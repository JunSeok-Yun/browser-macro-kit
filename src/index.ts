import { ENV } from "./config/env";
import { buildTargetForCategory } from "./config/target";
import { runSession } from "./session";
import { ProxyManager } from "./infra/proxyManager";
import { getRunningJob, incrementJobProgress, incrementJobFailedCount, completeJob, listenForJobCreated } from "./infra/db";
import { Job } from "./core/types";
import { sleep } from "./utils";
import * as logger from "./infra/logger";

const IDLE_POLL_MS = 30000;

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

      logger.setJobId(job.id);
      logger.info(`[메인] Job ${job.id} (${job.category}) 진행 중 — ${job.completedCount}/${job.targetCount}`, {
        event: "JOB_PROGRESS_START", category: job.category,
        completed: job.completedCount, target: job.targetCount,
      });

      const success = await runSession(proxyManager, target, job.id);

      if (success) {
        const progress = await incrementJobProgress(job.id);
        logger.info(`[메인] Job ${job.id} 진행률: ${progress.completedCount}/${progress.targetCount}`, {
          event: "JOB_PROGRESS", completed: progress.completedCount, target: progress.targetCount,
        });
        if (progress.completedCount >= progress.targetCount) {
          await completeJob(job.id);
          logger.info(`[메인] Job ${job.id} 완료.`, { event: "JOB_COMPLETE" });
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
      wake = () => { clearTimeout(timer); resolve(); };
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
