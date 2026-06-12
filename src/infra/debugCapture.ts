import * as fs from "fs";
import * as path from "path";
import { ENV } from "../config/env";
import { BlockType } from "../core/errors";

/** 차단 감지 시점의 페이지 HTML을 파일로 저장하고 상대 경로를 반환 */
export function saveDebugHtml(html: string, type: BlockType): string {
    fs.mkdirSync(ENV.DEBUG_HTML_DIR, { recursive: true });
    const fileName = `${type}_${Date.now()}.html`;
    const filePath = path.join(ENV.DEBUG_HTML_DIR, fileName);
    fs.writeFileSync(filePath, html, "utf-8");
    return path.relative(process.cwd(), filePath);
}
