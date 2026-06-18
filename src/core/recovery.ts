import { ENV } from "../config/env";
import { BlockType } from "./errors";

export interface RecoveryPolicy {
    rotateProxy: boolean;
    rotateProfile: boolean;
    extraDelayMs?: number;
}

export const BLOCK_RECOVERY: Record<BlockType, RecoveryPolicy> = {
    SELECTOR_BUG:      { rotateProxy: false, rotateProfile: false },
    AKAMAI_BLOCK:      { rotateProxy: true,  rotateProfile: false }, // in-session 재시도 후에도 실패 시 프록시 교체
    AKAMAI_IP_BLOCK:   { rotateProxy: true,  rotateProfile: false }, // IP 블랙리스트 → 즉시 프록시 교체
    COUPANG_APP_BLOCK: { rotateProxy: true,  rotateProfile: true  }, // RET9999: 세션 쿠키 기반 확정
    PORTAL_CAPTCHA:    { rotateProxy: true,  rotateProfile: false },
    AKAMAI_CHALLENGE:  { rotateProxy: true,  rotateProfile: false, extraDelayMs: ENV.CHALLENGE_RETRY_DELAY },
    PROXY_ERROR:       { rotateProxy: true,  rotateProfile: false },
    HTTP_ERROR:        { rotateProxy: false, rotateProfile: false },
};