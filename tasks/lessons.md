# Lessons Learned

## 2026-02-25 - Avoid slow shell approval paths

- User correction: commands were frequently blocked or delayed by command approval flow.
- Root pattern: using compound shell commands (`ls && cat || ...`) for discovery tasks.
- New rule:
  - Prefer `Glob`, `ReadFile`, and `rg` for code/file exploration.
  - Use shell only for execution/verification (`npm run type-check`, runtime checks).
  - Keep shell commands short and single-purpose when unavoidable.
- Expected effect: faster iteration, fewer approval interruptions, cleaner debug loop.

## 2026-02-25 - Never use placeholder dispatch member names

- User correction: dispatch failed because leader emitted `member="member-name"` literal placeholder.
- Root pattern: system prompt example used placeholder token that model copied directly.
- New rule:
  - In orchestrator prompts, examples must use real runtime member names, never placeholders.
  - Server side must normalize/validate member names and provide corrective feedback to leader.
  - Dispatch parser should accept both single and double quotes to reduce brittle failures.
- Expected effect: dispatch reliability improves; fewer false failed jobs from format drift.
