# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Project-Specific Rules

### 코드 수정 요청 시 응답 방식

코드 변경이 필요한 작업을 요청받으면, **직접 파일을 수정하지 말고** 사용자가 스스로 적용할 수 있도록 아래 형식으로 상세히 설명한다:

- 파일 경로와 수정 위치(줄 번호 또는 함수명)를 명시
- 변경 전(Before) / 변경 후(After) 코드를 **각각 별도의 전체 코드 블록**으로 제시 (diff `+`/`-` 표기 대신, 변경 전 블록과 변경 후 블록을 통째로 따로 보여줄 것)
- 한 파일 안에 여러 위치를 수정한다면 위치별로 Before/After 쌍을 나눠 제시
- 각 변경마다 **왜** 이렇게 바꿔야 하는지 이유를 설명
- 여러 파일에 걸친 변경이면 파일별로 섹션을 나누고, 마지막에 변경 파일 목록을 표로 정리

사용자가 명시적으로 "직접 수정해줘" 등으로 요청하기 전까지는 Edit/Write 도구로 파일을 변경하지 않는다.
