import "dotenv/config";
import * as path from "path";

export const ENV = {
  MAX_RETRY:    parseInt(process.env.MAX_RETRY ?? "5", 10),
  USER_DATA_ROOT: path.resolve(process.cwd(), process.env.USER_DATA_ROOT ?? "./user-data-test"),
  PROXY_FILE_PATH: path.resolve(process.cwd(), process.env.PROXY_FILE_PATH ?? "proxies.txt"),
  DEBUG_HTML_DIR: path.resolve(process.cwd(), process.env.DEBUG_HTML_DIR ?? "./debug-html"),
  HEADLESS:     process.env.HEADLESS === "true",
  NAVER_RATIO:  parseFloat(process.env.NAVER_RATIO ?? "0.5"),

  // 타이밍 (ms)
  NAVER_ENTRY_DELAY:        parseInt(process.env.NAVER_ENTRY_DELAY ?? "2000", 10),
  NAVER_SEARCH_DELAY:       parseInt(process.env.NAVER_SEARCH_DELAY ?? "3000", 10),
  GOOGLE_ENTRY_DELAY_MIN:   parseInt(process.env.GOOGLE_ENTRY_DELAY_MIN ?? "3000", 10),
  GOOGLE_ENTRY_DELAY_RANGE: parseInt(process.env.GOOGLE_ENTRY_DELAY_RANGE ?? "2000", 10),
  GOOGLE_SEARCH_DELAY:      parseInt(process.env.GOOGLE_SEARCH_DELAY ?? "3000", 10),
  COUPANG_ENTRY_DELAY:      parseInt(process.env.COUPANG_ENTRY_DELAY ?? "4000", 10),
  COUPANG_SEARCH_DELAY:     parseInt(process.env.COUPANG_SEARCH_DELAY ?? "3000", 10),
  PORTAL_AFTER_ENTRY_DELAY: parseInt(process.env.PORTAL_AFTER_ENTRY_DELAY ?? "3000", 10),
  NAV_TIMEOUT:              parseInt(process.env.NAV_TIMEOUT ?? "30000", 10),
  HTTP_ERROR_THRESHOLD:     parseInt(process.env.HTTP_ERROR_THRESHOLD ?? "3", 10),
  PROXY_FAIL_THRESHOLD:     parseInt(process.env.PROXY_FAIL_THRESHOLD ?? "2", 10),
  PROFILE_LOCK_STALE_MS:      parseInt(process.env.PROFILE_LOCK_STALE_MS ?? "600000", 10),
  INCOGNITO_RATIO:            parseFloat(process.env.INCOGNITO_RATIO ?? "0"),
  EDGE_RATIO:                 parseFloat(process.env.EDGE_RATIO ?? "0"),
  PROFILE_RESET_THRESHOLD:    parseInt(process.env.PROFILE_RESET_THRESHOLD ?? "20", 10),
};
