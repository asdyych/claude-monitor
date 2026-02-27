# Team Leader 单入口编排改造计划

## 0) 目标与成功标准

- 目标：用户只与 `team-lead` 交互，`team-lead` 自动拆解并分配任务给其他 agent，最终汇总并持续交互。
- 成功标准：
  - [x] 用户可在 Team 详情面板向 `team-lead` 发送自然语言消息。
  - [x] `team-lead` 能把子任务下发给指定成员（自动触发执行）。
  - [x] 子任务结果能回传给 `team-lead` 并在 UI 中可见。
  - [x] 全流程基于 WebSocket 实时更新，不依赖轮询。
  - [ ] 异常场景（成员崩溃、重复任务、超时）有可见反馈与可恢复路径。

---

## 1) 现状与关键约束（基于当前代码）

- 已有能力：
  - `TeamOrchestrator` 已支持 team 创建/启动/停止/销毁，并通过 `pty-manager` 管理 PTY。
  - `ws-handler` 已支持终端订阅、输入、输出、进程事件广播。
  - `TeamDetailPanel` 已支持展示运行中终端并接收 `process_started/process_exit`。
- 当前缺口：
  - 所有成员启动时都按预置 `task` 一次性执行（`-p`），没有“leader 常驻会话 + 动态分发”。
  - `~/.claude/teams/{teamId}/inboxes` 虽创建了目录，但未参与调度。
  - 缺少“只给 leader 发消息”的专用交互入口。

---

## 2) 方案对比（含优缺点）

### 方案 A：纯 PTY 命令驱动（不引入 inbox 协议）

- 做法：用户消息直接写入 `team-lead` PTY；leader 通过自然语言召唤其它成员（完全依赖模型行为）。
- 优点：
  - 改动最小，上线快。
  - 不新增协议，维护成本低。
- 缺点：
  - 不可控，分发不稳定（依赖提示词遵循度）。
  - 难做可靠重试、超时、幂等、防重复执行。
  - 可观测性差，难以确认“任务是否真的已派发”。

### 方案 B：文件 inbox + watcher 编排（推荐）

- 做法：定义轻量任务信封（JSON），leader 写入成员 inbox；服务端 watcher 触发成员执行，结果回写 leader inbox。
- 优点：
  - 强可控，可追踪（任务 ID、状态、重试、超时）。
  - 与现有 `inboxes/` 目录天然契合，改造路径清晰。
  - 可逐步演进到更复杂调度（优先级、并发限制、审批）。
- 缺点：
  - 需要新增协议与状态机，改造面中等。
  - 需处理 watcher 抖动、重复事件与并发竞争。

### 方案 C：中心调度器 + 内存队列（无文件中转）

- 做法：leader 输出解析为调度指令，直接进内存队列，由调度器派发执行。
- 优点：
  - 性能好、实现简洁。
  - 易做高级调度策略。
- 缺点：
  - 重启丢状态，恢复成本高。
  - 与现有 team 文件结构不对齐，排障可见性差。

**决策：采用方案 B（文件 inbox + watcher），并保留 WebSocket 实时可视化。**

---

## 3) 最终交互设计（做到“用户体验最好”）

### 3.1 用户侧交互（TeamDetailPanel）

- 新增 `Leader Chat` 区域（位于终端区上方，风格与现有深色面板一致）：
  - 输入框 + Send 按钮（`Ctrl/Cmd+Enter` 发送）。
  - 一键插入常用指令模板（如：`Plan`, `Implement`, `Review`, `Ship`）。
  - 状态提示：`Dispatching...` / `Waiting member results...` / `Done`.
- 发送路径：
  1) UI 发送 `send_to_leader`（WebSocket）。
  2) 服务端写入 leader PTY（或 leader inbox，见 3.3）。
  3) 立刻回显一条用户消息（optimistic UI）。

### 3.2 Leader 行为约束（系统提示）

- leader 启动为**常驻交互模式**（不使用 `-p`），职责单一：
  - 只做任务拆解、派发、汇总、对用户回复。
  - 不直接做大量编码（需要时可少量验证）。
- 约束输出格式（结构化，便于解析/追踪）：
  - `DISPATCH(member, task_id, goal, inputs, done_definition)`
  - `MERGE(task_id, summary, risks, next_step)`

### 3.3 编排协议（Inbox Envelope）

- 统一 JSON 信封（英文字段，内容可英文）：
  - `task_id`, `team_id`, `from`, `to`, `intent`, `payload`, `created_at`, `deadline_ms`, `retry`.
- 目录约定：
  - `inboxes/{memberName}.jsonl`：待处理任务流。
  - `inboxes/team-lead.jsonl`：成员回传结果流。
  - `inboxes/_state/{task_id}.json`：执行状态（queued/running/succeeded/failed/timeout）。

---

## 4) 实施任务拆解（可执行）

## Phase 1: 协议与服务层

- [x] 在 `src/types/ws.ts` 增加消息类型：
  - `send_to_leader`（client -> server）
  - `leader_ack`、`dispatch_update`（server -> client）
- [x] 在 `src/services/team-orchestrator.ts` 增加能力：
  - `sendUserMessageToLeader(teamId, text)`
  - `dispatchTaskToMember(teamId, memberName, envelope)`
- [x] leader 与 member 启动策略分离：
  - leader：交互常驻（无 `-p`）
  - member：任务型执行（保留 `-p`，按 envelope 动态唤起）

## Phase 2: WebSocket 路由与状态广播

- [x] 在 `src/services/ws-handler.ts` 路由 `send_to_leader`。
- [x] 发送失败、无 leader、team 不运行等场景返回结构化错误。
- [x] 广播 `dispatch_update`（queued/running/succeeded/failed）。

## Phase 3: 前端交互体验

- [x] 在 `src/components/teams/TeamDetailPanel.tsx` 增加 `Leader Chat` 输入区。
- [x] 新增 `dispatch timeline`（最近 20 条任务状态）。
- [ ] 与终端区联动：点击某任务可高亮对应成员终端。

## Phase 4: 可靠性与边界处理

- [ ] 幂等：同 `task_id` 重复投递只执行一次。
- [ ] 超时：成员超时后自动写回 `timeout`，并可重试（最多 N 次）。
- [ ] 失败恢复：成员进程退出时可按策略拉起，或回传人工处理建议。
- [ ] 并发控制：同成员同一时刻仅执行 1 个任务（队列化）。

## Phase 5: 验证与回归

- [ ] 端到端脚本：用户发 1 条需求 -> leader 拆 2~3 子任务 -> 成员执行 -> leader 汇总回复。
- [ ] 压测：连续 20 条消息，验证无重复执行、无状态错乱。
- [ ] 异常注入：强杀 member，验证 UI 与 leader 能感知并恢复。

---

## 5) 边界情况清单（必须覆盖）

- [ ] team 启动中收到消息（是否排队或拒绝）。
- [ ] leader 未运行但用户发送消息。
- [ ] 指定成员不存在/已下线。
- [ ] 同时多用户向同一 leader 发消息。
- [ ] watcher 重复触发导致任务重复执行。
- [ ] 大 payload（长任务）导致命令行/文件写入截断。
- [ ] Windows 路径/编码问题（CRLF、Git Bash 路径转换）。

---

## 6) 验收口径（你可直接按此验收）

- [ ] 功能验收：只给 leader 发消息即可完成多成员协作并回传结果。
- [ ] 交互验收：全程可见任务状态变化，反馈在 1s 内出现 ack。
- [ ] 稳定性验收：异常可恢复、无死锁、无重复执行。
- [ ] 体验验收：无需用户手动操作成员终端。

---

## 7) 本次规划输出结论（待你确认）

- 推荐按 **方案 B** 实施（文件 inbox + watcher + WebSocket 状态广播）。
- 实施顺序建议：`服务层协议` -> `WS 路由` -> `前端交互` -> `可靠性` -> `回归验证`。
- 预计改动文件（首批）：
  - `src/services/team-orchestrator.ts`
  - `src/services/ws-handler.ts`
  - `src/types/ws.ts`
  - `src/components/teams/TeamDetailPanel.tsx`

> Check-in: 你确认后，我按 Phase 1 开始实施，并在每个 Phase 完成后回报“变更点 + 验证结果 + 下一步”。
