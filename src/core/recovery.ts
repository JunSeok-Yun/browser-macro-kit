import { ENV } from "../config/env";
import { BlockType } from "./errors";

export interface RecoveryPolicy {
    rotateProxy: boolean;
    rotateProfile: boolean;
    extraDelayMs?: number;
}

export const BLOCK_RECOVERY: Record<BlockType, RecoveryPolicy> = {
    SELECTOR_BUG:      { rotateProxy: false, rotateProfile: true },
    AKAMAI_BLOCK:      { rotateProxy: true,  rotateProfile: true },
    COUPANG_APP_BLOCK: { rotateProxy: true,  rotateProfile: true },
    PORTAL_CAPTCHA:    { rotateProxy: true,  rotateProfile: true },
    AKAMAI_CHALLENGE:  { rotateProxy: true,  rotateProfile: true, extraDelayMs: ENV.CHALLENGE_RETRY_DELAY },
    PROXY_ERROR:       { rotateProxy: true,  rotateProfile: false },
    // HTTP_ERROR는 연속 횟수(httpErrorStreak) 기반 정책이라 index.ts에서 별도 처리하며
    // 이 테이블은 조회되지 않음. Record<BlockType, ...>의 타입 완전성을 위해서만 존재
    HTTP_ERROR:        { rotateProxy: false, rotateProfile: false },
};
