# 战斗脚本阅读入口

这份文档用于给后续新聊天快速建立 `src/旅法师/脚本/战斗` 的上下文。

目标：
- 让后续修改先从这套脚本入手，不再默认翻旧设计文档。
- 帮助快速判断需求应该落在哪个文件。

适用范围：
- `src/旅法师/脚本/战斗/*`
- 相关底座依赖：
  - `src/旅法师/schema.ts`
  - `src/旅法师/脚本/MVU/state-access.ts`

不必优先阅读：
- 旧设计文档
- 与战斗无关的页面、脚本、资源目录

## 文件职责

### `index.ts`
- 战斗浮窗脚本入口。
- 负责监听打开/关闭消息。
- 负责提供独立启动按钮，不再强依赖状态栏界面。
- 负责创建 iframe、挂载 Vue 战斗窗口。
- 不负责战斗规则或状态推进。

### `session.ts`
- 战斗主控制器和状态机核心。
- 负责：
  - 开始战斗
  - 恢复或重建战斗
  - 玩家策略文本写入
  - 玩家检定重掷
  - 玩家确认后进入 AI 结算
  - 生成预览后应用到下一回合
  - 结束战斗
  - 放弃战斗并回滚
- 这是后续多数战斗逻辑修改的第一入口。

### `resolve.ts`
- AI 单回合结算适配层。
- 负责：
  - 构建 system prompt
  - 调用 `generateRaw`
  - 约束 AI 返回严格 JSON Schema
  - 解析并校验 `pending_preview`
- 如果需求涉及 AI 输出字段、结算格式、提示词规则，先看这里。

### `prompt.ts`
- 构造战斗 prompt 载荷。
- 负责：
  - 定义传给 AI 的最小上下文
  - 汇总战斗规则摘要
  - 提供 `mockPreview` 依赖的预览草案生成
- 如果需求涉及 prompt 内容、传给 AI 的上下文、调试假预览，先看这里。

### `commit.ts`
- 战斗终局提交层。
- 负责把战斗结果写回主状态：
  - 主角当前化身
  - 队伍
  - 敌方清空
  - 背包掉落合并
  - 世界近期事务追加
  - 清空 `battle_session`
- 如果问题表现为“战斗结束后主状态不对”，先看这里。

### `snapshot.ts`
- 战前快照和回滚。
- 用于：
  - 开战时保存主状态快照
  - 放弃战斗时恢复主状态
- 如果需求涉及撤销、回滚、保留战前数据，先看这里。

## 底座依赖

### `schema.ts`
- 定义 `BattleSessionSchema`、`PendingPreviewSchema`、`PlayerCheckSchema` 等结构。
- 战斗态关键字段包括：
  - `meta`
  - `phase`
  - `round`
  - `player_check`
  - `shared_dark_pool`
  - `combatants`
  - `prebattle_snapshot`
  - `pending_preview`
  - `round_checkpoint`
  - `output_mode`
- 如果需求要改字段结构、阶段枚举、输出模式，必须同时检查这里。

### `MVU/state-access.ts`
- 负责读写 canonical state 和 `battle_session`。
- 关键边界：
  - `editCanonicalState` 可改全量状态
  - `editBattleSession` 只能改战斗态，且会校验主状态投影不变
  - `editMainState` 只能改主状态，且会校验 `battle_session` 不变
- 如果需求涉及事务边界、状态污染、写回范围错误，先看这里。

## 当前确认的主流程

1. `startBattle`
- 从主状态构建 `battle_session`
- 保存战前快照
- 初始化玩家检定和共享暗骰池

2. `setStrategyText` / `rerollPlayerCheck`
- 玩家填写策略
- 可在确认前进行有限次数重掷

3. `confirmPlayerCheck`
- 锁定本回合玩家检定
- 将阶段切到 `ai_resolve`
- 调用 AI 结算

4. `resolveConfirmedRound`
- 读取当前战斗快照
- 调用 `resolve.ts` 生成 `pending_preview`
- 成功后进入 `preview`
- 失败则回退到 `player_input`

5. `applyPendingPreview`
- 将预览中的 `proposed_combatants` 写回当前战斗态
- 回合数加一
- 阵营切换
- 重置玩家检定和共享暗骰池
- 清空预览
- 刷新 `round_checkpoint`
- Runtime/profile 流程下，若 `pending_preview.proposed_combatants` 缺失或被裁空，会回退到当前 `battle_session.combatants` 再推进，避免“应用结果”阶段直接卡死

6. `finishBattle`
- 将阶段切到 `finished`
- 保留当前最终检查点

7. `commitBattle`
- 把战斗结果真正写回主状态

8. `abandonBattle`
- 恢复战前快照
- 清空 `battle_session`

## 关键设计判断

### 1. `battle_session` 是临时战斗态
- 主状态不是边打边直接改。
- 战斗过程先写入 `battle_session`，终局时再提交。

### 2. AI 输出不是直接落盘
- AI 先返回 `pending_preview`。
- 用户确认或流程推进后，才把结果用于战斗态或主状态。

### 3. 回滚能力依赖快照完整性
- `abandonBattle` 的正确性取决于 `prebattle_snapshot` 是否覆盖了需要恢复的字段。

### 4. 事务隔离是显式设计
- 这套实现明确区分：
  - 改战斗态
  - 改主状态
  - 改完整状态
- 改动时不要绕过这层边界。

## Runtime 回合 Prompt 组成

有战斗配置 profile 时，正式请求不走 `prompt.ts` 的经典 `buildBattleRoundPrompt()`，而是走：

```text
App.vue confirm/resolveAgain
  -> store.executeConfiguredBattleTurn()
  -> createSelectedRuntimeData()
  -> createBattleSessionRuntimeOptions()
  -> runtime-ai.ts buildBattleRuntimePayload()
  -> requestRuntimeJson()
```

第三回合的请求文段由三层组成：

1. `system`：当前 battle profile 的 `prompts.single_round.system_prompt`。
2. `user`：当前 battle profile 的 `prompts.single_round.user_prompt`。
3. `runtime_payload=` 后面的 JSON：
   - `selected_data`：字段选择后的数据。
   - `player_command`：本回合玩家输入。
   - `dice_inputs`：`battle_session.player_check` 和 `shared_dark_pool`。
     - 明骰字段现在明确写成 `check_owner=玩家方`、`check_label=玩家方技能检定`、`player_skill_check=玩家方技能检定：1d20=xx`
     - 暗骰池额外带 `dark_pool_label`、`dark_pool_instruction`，明确告知 AI 这是后续检定要按顺序消耗的骰子池
   - `worldbook_context`：世界书上下文数组，来自 battle profile 中已导入且启用的世界书序列化结果。
   - `environment_context`：可选环境上下文。
   - `extra_instructions`：战斗规则补充、历史回合摘要、累计更新提示。

重要边界：

- `selected_data` 应始终基于原始 `rawMainState` 的字段形状提取，再叠加 `battle_session.runtime.accumulated_updates`。
- 不能在第二回合后把字段选择输入切到 `projectMainStateFromBattleSession()` 的 schema 投影态；投影态只保留 `世界/主角/队伍/敌方/背包/任务/当前可见卡`，会让原先选择的 raw MVU 路径失效，表现为第三回合 `selected_data` 只剩一小节。
- AI 返回的 `selected_data_updates` 只是累计更新，不应让字段树的数据源换形状。

经典无 profile 流程不同：

```text
session.confirmPlayerCheck()
  -> resolveConfirmedRound()
  -> prompt.ts buildBattleRoundPrompt()
```

经典流程会从 `prebattle_snapshot + combatants` 重构战斗 prompt；runtime 流程则以 `runtime_payload.selected_data` 为核心。

快速整场模式的差异：

- `requestBattleFullBattle()` 使用 `prompts.full_battle`，但运行时会额外追加战利品契约，避免旧 profile 的快速整场 prompt 仍只要求战斗结算。
- `runtime_payload.turn_mode = "full_battle"` 时会同时携带 `loot_protocol` 和 `settlement_mode`。
- full_battle 返回结构现在包含 `loot_result`、`loot_mvu_updates`、`loot_context`；这些会和 `final_selected_data_updates` 一起进入 pending preview。
- 单回合模式不合并战利品 prompt，仍按“战斗结束后单独结算战利品”的流程走。

调试可见性：

- 设置页“测试”面板现在显示最近一次发送提示词快照，包括 `system`、最终 `user` message 和 `runtime_payload`。
- 只看 `runtime_payload` 会看不到 prompt 模板文本；判断单回合/快速整场差异应看 `lastRuntimePrompt.kind` 和最终 `messages`。

## 最近一轮修复（2026-06）

1. 重新结算当前回合：
- `resolveAgain()` 在 Runtime/profile 流程下，会先清掉本回合旧 `pending_preview`、旧系统回答和同回合 history，再重新请求 AI。
- 目标是让“重新结算”覆盖本回合结果，而不是叠出两条同回合回答。

2. 骰子锁定：
- 一个回合内，明骰“确定”后会锁定，直到玩家真正发送指令并推进到下一回合才解锁。
- 这条约束只针对当前回合，避免同回合反复确认多个玩家明骰。

3. 应用结果推进：
- `applyPendingPreview()` 现在是 Runtime 回合推进的最后保险丝。
- 如果 preview 缺 `proposed_combatants`，不会再直接报错，而是退回当前 `battle_session.combatants` 再推进。

4. 接口测试状态：
- 设置页顶部“接口”状态不再只看旧的 active profile 记录，也会读当前草稿上的最新 `last_test_result`。
- 如果 `generateRaw` 可用，状态文案会显示为“酒馆链路可用”。

5. 设置页结构：
- 一级导航已收敛为 `运行 / 战斗规则 / 世界书 / 高级`。
- “运行模式 / 回合处理方式 / 战利品结算”统一改为单选圆点。
- 高级中的 Prompt 编辑器、字段取舍、运行前预览、测试面板默认都应视为低频折叠区。

## HTYQ 可借鉴点

参考目录：`docs/HTYQ-main`。

### 优先借鉴

1. `ui/settings/htyq-ui-settings-worldbook.js`
   - 借鉴角色绑定、全局启用、手动选择三种世界书来源。
   - 借鉴自动清理 character/global 来源、保留 manual 来源的策略。
   - 应在本项目落成 TS 工具和 Vue 设置组件，不照搬 `window.__HTYQ_*`。

2. `ui/settings/htyq-ui-settings-helpers.js`
   - 借鉴 `entriesToText()`、世界书名称读取、世界书内容读取、条目多选弹窗。
   - 本项目应把条目选择接入 battle profile，让 `worldbook_context` 不再是空数组。

3. `main.js`
   - 借鉴浮窗拖拽、位置记忆、resize 边界校准、移动端点外关闭。
   - 本项目已有 iframe 健康检查、重试挂载、postMessage 控制；只借交互，不替换宿主结构。

4. `ui/settings/htyq-ui-settings-core.js`
   - 借鉴 API 设置页的模型列表拉取和选择体验。
   - 本项目 `api-client.ts` 已有更完整的 URL 规范化、连接测试、重试和模型发现，不应降级成 HTYQ 的 fetch 版本。

### 不建议照搬

- 全局 `window.HTYQ_*` 模块通信。
- 纯 `innerHTML` 重绘和手动 DOM 事件绑定。
- localStorage 作为主要状态存储。
- 硬编码 prompt/token 参数。
- 只做代码块剥离的弱 JSON 修复。

## 改需求时的定位规则

如果需求是这些类型，优先看对应文件：

- 改战斗流程、phase、回合推进：
  - `session.ts`

- 改 AI 提示词、AI 输出 JSON、预览结构：
  - `resolve.ts`
  - `prompt.ts`

- 改战斗结束后的掉落、事件、角色/队伍写回：
  - `commit.ts`

- 改战前保存和放弃恢复：
  - `snapshot.ts`

- 改窗口打开、关闭、挂载方式：
  - `index.ts`

- 改字段定义、枚举、校验结构：
  - `schema.ts`

## 新聊天建议用法

新聊天时可以直接这样说：

```text
先读 src/旅法师/脚本/战斗/README.md，再处理这次战斗需求。
不要先翻旧设计文档。
```

如果要再精确一点，可以补一句：

```text
这次只改 session/resolve/commit，不碰 UI。
```

## 当前文档结论的边界

这份文档是基于当前代码阅读得到的实现级总结，不是产品设计文档。

如果后续发生这些变化，应同步更新本文件：
- `battle_session` 字段结构变化
- phase 流程变化
- AI 预览协议变化
- 终局提交字段变化
