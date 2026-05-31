# 详细实施计划（MVU + Battle 专项）

> 规划态产物；不包含直接实现代码  
> 基线输入：
> - `.omx/specs/deep-interview-docs-requirements-srs.md`
> - `.omx/specs/deep-interview-battle-flow-p1.md`
> - `.omx/specs/deep-interview-ralplan-handoff-mvu-battle.md`
> - `util/mvu.ts`
> - `util/mvu_zod.ts`
> - `util/script.ts`
> - `初始模板/角色卡/新建为src文件夹中的文件夹/*`
> - `示例/角色卡示例/*`

---

## 1. Outcome
输出一条可执行、可验证、可分工的落地路线，把“旅法师角色卡 + MVU 热状态 + 可见卡 + 战斗浮窗”拆成：
- 明确的数据合同
- 明确的目录与文件落点
- 明确的阶段依赖
- 明确的验证与回归路径

本计划默认先交付 **P0 主热状态闭环**，再交付 **P1 战斗首版闭环**，最后保留 **P2 特殊判定扩展位**。

---

## 2. RALPLAN-DR Summary

### Principles
1. **主热状态先稳定，战斗态后隔离接入**
2. **AI 保留叙事与数值裁定权，脚本只做边界、流程和回滚**
3. **所有跨层/跨系统写回都必须显式过滤、校验、确认**
4. **模板优先、工具优先，不为首版引入新框架**
5. **战斗态以“当前楼层可恢复、跨楼层可重建”为首版真相**

### Decision Drivers
1. `util/mvu.ts` 已支持 latest/-1 语义，适合主热状态跟随最新楼层
2. battle spec 明确要求 `battle_session` 同层恢复、跨楼层重建、删楼回退
3. handoff 明确要求区分主 `schema.ts`、message 临时战斗态、以及不进入 MVU 的内容

### Viable Options

#### Option A — 单一主 Schema，`battle_session` 作为独立临时字段并受普通 UI / prompt 过滤
- Pros
  - 最简单，和 `registerMvuSchema` / `defineMvuDataStore` 兼容度最高
  - 同层恢复、跨楼层重建、删楼回退最容易落地
  - 终局提交 / 放弃回滚只需要处理同一份 `stat_data`
- Cons
  - 需要非常严格地避免普通状态栏与日常 prompt 误读 `battle_session`
  - “不是主常驻字段”只能靠语义和过滤实现，而非物理分库

#### Option B — 主 Schema + battle-only schema，分脚本注册
- Pros
  - 语义分层更干净
  - 主角色卡热状态不会混入战斗临时字段
- Cons
  - 注册顺序、增量校验、字段合并复杂度更高
  - 更容易出现 battle UI 与主热状态解析结果不一致

#### Option C — `battle_session` 完全不落 MVU，只放前端局部状态
- Pros
  - 普通状态栏 / prompt 天然不会误读
- Cons
  - 无法满足 battle spec 的同层恢复、删楼回退、跨楼层重建要求
  - 浏览器刷新 / UI 关闭后的恢复性差

### Decision
选择 **Option A** 作为首版实现路线。

### Why chosen
它最符合现有工具链和 battle spec 的“按楼层恢复/重建”要求，同时能在不新增复杂 schema 机制的前提下把战斗闭环做出来。

### Consequences
- `battle_session` 在**存储层**位于当前楼层 `stat_data` 内
- `battle_session` 在**产品语义层**不属于普通状态栏主热状态
- 普通状态栏、日常 prompt、普通回写白名单必须显式排除 `battle_session`
- 战斗浮窗必须优先读取 `battle_session`，而非主热状态镜像

---

## 3. Scope Map

## 属于主 `schema.ts` 的内容（P0）
- `世界`
- `主角.当前化身`
- `主角.旅法师`
- `队伍`
- `敌方`
- `背包`
- `任务`
- `当前可见卡`

## 属于 message 级临时战斗态的内容（P1）
- `battle_session`
  - 当前阶段 / 战斗状态机
  - 当前回合号
  - 当前行动阵营
  - 明骰状态与重掷计数
  - 共享暗骰池与消费进度
  - 战前快照
  - 参战副本（完整副本，不是差量）
  - 回合结算预览
  - 终局输出模式
  - 当前楼层来源信息 / 恢复或重建标记

## 不进入 MVU / prompt 的内容
- 正式卡牌仓库全文
- 历史 `CombatLog`
- 历史 `DicePool`
- battle 过程中的中间思考缓存 / AI 原始草稿

---

## 4. 目标目录与文件落点

建议以模板骨架新建角色卡根目录：

```text
src/旅法师/
  schema.ts
  index.yaml
  世界书/
    变量/
      initvar.yaml
      变量列表.txt
      变量更新规则.yaml
      变量输出格式.yaml
  脚本/
    变量结构/
      index.ts
    MVU/
      index.ts
    战斗/
      index.ts
      session.ts
      snapshot.ts
      prompt.ts
      commit.ts
  界面/
    状态栏/
      App.vue
      index.ts
      store.ts
      global.css
      components/*
    战斗浮窗/
      App.vue
      index.ts
      store.ts
      global.css
      components/*
```

### 复用的现有工具
- `util/mvu.ts`：latest/-1 store 语义
- `util/mvu_zod.ts`：MVU schema 注册、增量更新校验
- `util/script.ts`：`createScriptIdIframe()`、生命周期挂载

---

## 5. 分阶段实施计划

## Phase 0 — 骨架冻结与命名合同
### 目标
在正式写功能前，先冻结目录、字段命名、白名单边界和世界书接口。

### 任务
1. 从 `初始模板/角色卡/新建为src文件夹中的文件夹/*` 复制角色卡骨架到 `src/旅法师/`
2. 定义主 `schema.ts` 顶层结构与子结构命名
3. 定义聊天变量仓库字段名、主热状态字段名、`battle_session` 命名空间
4. 定义世界书四件套的最小草案
5. 定义普通 prompt 与 battle prompt 的裁剪边界

### 验收
- 目录结构不再摇摆
- 所有后续实现都基于同一组字段名和同一套路径

---

## P0 — 主热状态最小稳定闭环

### P0-W1：主 `schema.ts` 设计
#### 目标
让主热状态结构可以稳定 parse / re-parse / 增量更新。

#### 任务
1. 定义基础值对象：
   - 五维对象
   - `状态效果[]`
   - `技能列表: record`
   - `装备: object/record`
2. 定义 `主角.当前化身` 最小合同：
   - `id / 名称`
   - 五维
   - `HP当前 / HP上限`
   - `MP当前 / MP上限`
   - `护盾量`
   - `物攻 / 魔攻 / 物防 / 魔防`
   - `技能列表`
   - `状态效果`
   - `装备`
3. 定义 `主角.旅法师` 最小合同：
   - 火花阶段、阶段进度、位面锚点、地印、界徽、卡牌上限、下一阶段、金钱
4. 定义 `队伍` / `敌方` 为 `record by id`
5. 定义 `背包` / `任务` / `当前可见卡` 为 `record by id`
6. 所有需要边界保护的数字使用 `z.coerce.number()` + `transform/clamp`
7. 所有可清空对象优先采用 `prefault({})`

#### 文件落点
- `src/旅法师/schema.ts`

#### 验收
- `Schema.parse(Schema.parse(input))` 语义稳定
- 动态集合全部使用 `record`，不使用数组索引表达主业务实体
- 不把 old/new diff 规则塞进 schema

---

### P0-W2：变量结构注册与世界书变量合同
#### 目标
让主热状态既能被脚本校验，也能被世界书稳定初始化和更新。

#### 任务
1. 基于模板写 `脚本/变量结构/index.ts`
2. 只保留 `registerMvuSchema(Schema)` 最小职责
3. 输出世界书四件套：
   - `initvar.yaml`
   - `变量列表.txt`
   - `变量更新规则.yaml`
   - `变量输出格式.yaml`
4. 在变量更新规则里只允许 AI 更新主热状态白名单
5. 明确禁止 AI 直接改：
   - 正式卡牌仓库
   - `当前可见卡`
   - `battle_session`

#### 文件落点
- `src/旅法师/脚本/变量结构/index.ts`
- `src/旅法师/世界书/变量/*`

#### 验收
- 世界书初始化能产出可解析的 `stat_data`
- AI 变量输出格式与 schema 相容

---

### P0-W3：latest 楼层状态栏 store 与生命周期
#### 目标
状态栏永远跟随最新楼层，而不是绑定旧消息。

#### 任务
1. 改写模板 store，不再使用 `getCurrentMessageId()`
2. 统一用 `defineMvuDataStore(Schema, { type: 'message', message_id: 'latest' })`
3. 在状态栏入口脚本执行：
   - `await waitGlobalInitialized('Mvu')`
   - `await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'))`
4. 用 `createScriptIdIframe()` 挂载状态栏
5. 生命周期统一走 `$(() => {})` + `pagehide`

#### 文件落点
- `src/旅法师/界面/状态栏/store.ts`
- `src/旅法师/界面/状态栏/index.ts`
- `src/旅法师/脚本/MVU/index.ts`

#### 验收
- 新楼层出现后状态栏自动跟随
- 关闭 / 切换聊天不会遗留脏 iframe

---

### P0-W4：状态栏五大页壳与主热状态编辑
#### 目标
让用户能看到并编辑主热状态，但不暴露冷仓库全文。

#### 页面
1. 属性页：`世界` + `主角`
2. 队伍页：`队伍`
3. 背包页：`背包`
4. 任务页：`任务`
5. 卡牌页：`当前可见卡`

#### 任务
1. 每页先做列表/详情基础壳，不追求首版复杂交互
2. 对 `敌方` 只提供查看和“进入战斗”入口，不在 P0 做 battle 内交互
3. `当前可见卡` 只显示摘要，不显示正式卡牌全文
4. 所有编辑通过 store 驱动，让 schema 二次清洗

#### 文件落点
- `src/旅法师/界面/状态栏/App.vue`
- `src/旅法师/界面/状态栏/components/*`

#### 验收
- 五大页至少可读
- 基础编辑不会破坏 schema

---

### P0-W5：正式卡牌仓库与当前可见卡链路
#### 目标
建立“冷仓库 -> 当前可见卡摘要 -> prompt”的过滤链路。

#### 任务
1. 设计聊天变量中的正式卡牌仓库结构
2. 设计仓库 CRUD 封装
3. 设计“加入/移出当前可见卡”的操作
4. 设计仓库卡全文 -> 可见摘要复制规则
5. 设计删除卡牌后的引用清理
6. 设计超预算提示（如可见卡数量 / 摘要总长度）

#### 文件落点
- `src/旅法师/脚本/MVU/index.ts` 或 `scripts/cards.ts`（实现时可拆）
- `src/旅法师/界面/状态栏/components/cards/*`

#### 验收
- prompt 只见摘要，不见仓库全文
- 删除仓库项后不会残留悬挂可见卡摘要

---

### P0-W6：主聊天 AI 回写安全链路
#### 目标
把 AI 变量回写收敛成固定安全管道。

#### 任务
1. 定义主热状态白名单路径
2. 定义非法更新提示和拒绝策略
3. 自建 AI 请求后显式执行：
   - `Mvu.parseMessage`
   - 白名单过滤
   - `Schema.safeParse`
   - `Mvu.replaceMvuData`
4. 加入 HP/MP 非负保护
5. 明确普通聊天禁止碰触 `battle_session`

#### 文件落点
- `src/旅法师/脚本/MVU/index.ts`

#### 验收
- 非法路径零静默失败
- 合法更新可以稳定落地

---

### P0-W7：背包整理为正式卡牌的事务流程
#### 目标
实现“AI 产草案、脚本验收、成功才提交”的事务闭环。

#### 任务
1. 设计整理入口与整理方向枚举
2. 设计 AI 卡牌 JSON 草案合同
3. 设计稳定 cardId 生成策略
4. 先生成完整候选卡，再统一校验
5. 成功后：
   - 写入聊天变量仓库
   - 扣减背包
   - 同步当前可见卡摘要（若用户选择加入）
6. 失败后：
   - 仓库不写入
   - 背包不扣减
   - 给出错误提示

#### 验收
- 不出现半成功状态
- 同一背包物品重复整理不会产生不可解释重复卡

---

### P0-W8：Prompt 隔离与历史遮蔽
#### 目标
阻断历史随机源与战斗记录污染。

#### 任务
1. 遮蔽历史 `<DicePool>`
2. 遮蔽历史 `<CombatLog>`
3. 普通 prompt 只注入：
   - 主热状态
   - 当前可见卡摘要
4. 显式排除：
   - 正式卡牌仓库全文
   - `battle_session`

#### 验收
- 日常聊天不受历史 battle / dice 污染

---

## P1 — 战斗首版闭环

### P1-W1：`battle_session` 字段合同冻结
#### 目标
把 battle spec 的流程与状态机翻译成一个最小可用数据合同。

#### 建议字段组
1. `meta`
   - `source_message_id`
   - `mode: 'resume' | 'rebuild'`
   - `created_at / updated_at`
2. `phase`
   - `idle | initiative | player_input | player_roll | ai_resolve | preview | finished | aborted`
3. `round`
   - `round_no`
   - `acting_side`
4. `player_check`
   - `strategy_text`
   - `roll`
   - `reroll_used`
   - `confirmed`
5. `shared_dark_pool`
   - `values[]`
   - `cursor`
6. `combatants`
   - `allies: record`
   - `enemies: record`
7. `prebattle_snapshot`
8. `pending_preview`
9. `output_mode`
   - `summary_only | full_log`

#### 说明
这里建议**完整副本存储**，不只存差量；该建议直接来自 battle spec 7.15。

#### 验收
- 能表达同层恢复、跨楼层重建、终局提交、完全放弃

---

### P1-W2：战斗浮窗架构
#### 目标
建立独立于状态栏的战斗 UI 容器。

#### 任务
1. 使用 `createScriptIdIframe()` 单独挂载战斗浮窗
2. 战斗浮窗 store 优先读取 `battle_session`
3. 普通状态栏继续读主热状态，不读战斗副本
4. 明确状态栏与战斗浮窗协作：
   - 状态栏只负责入口与只读提示
   - 战斗浮窗负责完整战斗流程

#### 文件落点
- `src/旅法师/界面/战斗浮窗/index.ts`
- `src/旅法师/界面/战斗浮窗/store.ts`
- `src/旅法师/界面/战斗浮窗/App.vue`

#### 验收
- 战斗 UI 生命周期独立
- 关闭后可重开并恢复/重建

---

### P1-W3：战前快照、锁定、恢复 / 重建
#### 目标
满足 battle spec 的楼层跟随规则。

#### 任务
1. 进入战斗时保存战前快照
2. 锁定：
   - 当前可见卡编辑
   - 仓库操作
   - 背包整理
3. 同层重开：
   - 若存在已结算到整回合边界的 `battle_session`，直接恢复
4. 跨楼层重开：
   - 以前端当前所在楼层 `敌方 + 主热状态` 重建新的 `battle_session`
5. 删楼回退：
   - 按回退后楼层重新读取并可重新开打
6. 完全放弃：
   - 回滚到 `prebattle_snapshot`
   - 清空 `battle_session`

#### 文件落点
- `src/旅法师/脚本/战斗/snapshot.ts`
- `src/旅法师/脚本/战斗/session.ts`

#### 验收
- 中途关闭不会留下半回合脏状态
- 同层恢复 / 跨层重建 / 放弃回滚三种路径都可解释

---

### P1-W4：单回合交互闭环
#### 目标
跑通 `策略 -> 明骰 -> 重掷 -> 确认 -> AI 结算 -> 预览 -> 提交`。

#### 任务
1. 玩家输入自然语言策略
2. 系统生成本回合唯一明骰
3. 最多 3 次重掷
4. 玩家确认后冻结本回合玩家骰面
5. 同时生成/维护 5 次共享暗骰池
6. 把：
   - 策略
   - 明骰最终结果
   - 当前 `battle_session`
   - 必要规则摘要
   发送给 AI
7. AI 回传回合预览与变量更新草案
8. 前端显示预览，用户确认后才提交到 `battle_session`

#### 文件落点
- `src/旅法师/界面/战斗浮窗/components/*`
- `src/旅法师/脚本/战斗/prompt.ts`

#### 验收
- AI 只看到最终确认后的玩家明骰
- 未确认前不提交战斗变化

---

### P1-W5：回合级 battle-only 写回
#### 目标
让战斗中的变化只进入临时副本，不污染主热状态。

#### 任务
1. AI 回合结果先写入 `battle_session.combatants`
2. 中间回合不改主 `敌方` / `主角` / `队伍`
3. 中间回合不向主楼层追加 `CombatLog`
4. 只在“整回合已结算完成”边界持久化 battle 进度

#### 验收
- 普通状态栏始终看到战前主热状态
- 战斗浮窗内部看到 battle 副本

---

### P1-W6：终局提交与主楼层回写
#### 目标
只在战斗结束时把必要结果合并回主热状态。

#### 任务
1. 从 `battle_session` 提取终局提交包：
   - `主角`
   - `队伍`
   - `敌方`
   - `背包`（战利品）
   - `世界.近期事务`
   - `CombatLog`
2. 用户选择：
   - 全流程日志
   - AI 战斗小结
3. 执行终局合并：
   - 覆盖必要热状态
   - 清空 `敌方`
   - 写入 `近期事务`
   - 追加叙事 `CombatLog`
   - 清空 `battle_session`
4. 释放锁定

#### 文件落点
- `src/旅法师/脚本/战斗/commit.ts`

#### 验收
- 终局后主热状态与 `battle_session` 不再分裂
- `battle_session` 被清理

---

## P2 — 延后扩展
1. AI 结构化特殊判定请求
2. 高难度暗骰 / 多段判定
3. 快速整场战斗
4. 更复杂状态模板与职业技能模板

P2 不阻塞 P0 / P1。

---

## 6. 依赖与关键路径

```text
Phase 0
  -> P0-W1
  -> P0-W2
  -> P0-W3
  -> P0-W4
  -> P0-W5
  -> P0-W6
  -> P0-W7
  -> P0-W8
  -> P1-W1
  -> P1-W2
  -> P1-W3
  -> P1-W4
  -> P1-W5
  -> P1-W6
```

### 实际关键路径
`目录冻结 -> schema -> 世界书合同 -> latest store -> 主回写安全 -> battle_session 合同 -> 战前快照/锁定 -> 单回合交互 -> 终局提交`

---

## 7. Risk Register

| 风险 | 影响 | 缓解 |
|---|---|---|
| 把 battle 临时态硬塞进普通状态栏流程 | 主热状态与战斗态串味 | 普通状态栏与 prompt 显式过滤 `battle_session` |
| 继续照搬模板 `getCurrentMessageId()` | 写错楼层 | 强制 latest / -1 语义 |
| 战斗中途写主热状态 | 放弃回滚失真 | 中间回合只写 `battle_session` |
| battle_session 不存完整副本 | 回滚 / 重建困难 | 明确保存完整副本 |
| 跨楼层仍尝试续打旧 session | 状态错乱 | 统一改为“按当前楼层重建” |
| 仓库全文泄漏进 prompt | token 爆炸 / AI 污染 | 只注入 `当前可见卡` 摘要 |
| 背包整理半成功 | 冷热数据不一致 | 事务式提交 |

---

## 8. Verification Plan

### P0 验证
1. schema 幂等 parse
2. latest store 跟随新楼层
3. 状态栏 5 页可读
4. 仓库全文不进入 prompt
5. 非法 AI 更新被拒绝
6. 背包整理失败可回滚
7. 历史 `DicePool` / `CombatLog` 被遮蔽

### P1 验证
1. 从 `敌方` 进入战斗
2. 战前快照建立成功
3. 同层关闭重开可恢复
4. 新楼层重开按当前楼层重建
5. 单回合走通：策略 -> 骰面 -> 重掷 -> 确认 -> AI 结算 -> 预览 -> 提交
6. 中间回合不污染主热状态
7. 完全放弃回滚到战前
8. 终局提交后清空 `敌方`、覆盖 `近期事务`、落 `CombatLog`

---

## 9. Available Agent Types / Staffing Guidance

### 推荐角色分工
- `executor`：实现 `schema.ts`、状态栏、战斗脚本、提交链路
- `designer`：战斗浮窗与状态栏交互细化
- `test-engineer`：交易回滚、楼层恢复/重建、战斗流程测试设计
- `verifier`：终局回写与 prompt 隔离证据核查

### 推荐执行切片
1. Lane A：主 schema + 世界书变量合同
2. Lane B：状态栏 + latest store
3. Lane C：仓库 / 当前可见卡 / 背包整理
4. Lane D：battle_session + 战斗浮窗 + 快照 / 回滚 / 提交

---

## 10. Team Verification Path
若走 `$team`，建议验证顺序：
1. Lane A 完成后先过 schema / worldbook 验证
2. Lane B 与 Lane C 并行，但必须在 Lane A 冻结字段名后开始
3. Lane D 必须依赖 Lane A、B、C 的字段与入口冻结
4. 集成后统一跑：
   - 主热状态回写回归
   - 仓库与可见卡回归
   - 战前快照 / 同层恢复 / 跨层重建 / 终局提交回归

---

## 11. Goal-Mode Follow-up Suggestions
- **默认**：`$ultragoal`  
  适合按 P0 -> P1 顺序做 durable execution，并记录阶段性证据。

- **并行实施**：`$ultragoal` + `$team`  
  适合将 schema/store、仓库/可见卡、battle 浮窗分 lane 并行推进。

- **显式 Ralph fallback**：`$ralph`  
  仅当你想要单代理持续盯住“改完-验证-再改”的收口压力时采用，不作为默认推荐。

---

## 12. Next Step Recommendation
推荐下一步不是直接全量开工，而是先进入一个 **P0 字段冻结 + 目录骨架创建** 的执行目标，然后按以下顺序推进：
1. 骨架与字段名冻结
2. 主 schema / 世界书合同
3. latest 状态栏
4. 仓库 / 当前可见卡 / 背包整理
5. 主聊天安全回写
6. `battle_session` 与战斗浮窗

---

## 13. Architect Tightening Addendum
本节用于吸收架构审查提出的执行前收紧项；若与上文笼统表述冲突，以本节为准。

### 13.1 单一状态访问合同
后续执行阶段不得让状态栏、战斗浮窗、仓库管理、背包整理各自发明写路径；必须先收敛为统一访问层。

#### 统一访问层职责
1. `latest message MVU` 的读写
2. `chat variables` 冷仓库的读写
3. 关键事务的 commit / rollback 入口
4. 普通回写与 battle 回写的白名单过滤

#### 实施要求
- 状态栏只通过统一 store / mutation facade 改主热状态
- 战斗浮窗只通过 battle mutation facade 改 `battle_session`
- 仓库与背包整理只通过 transaction facade 改 chat vars + hot state
- 不允许在 Vue 组件里直接散落 `replaceVariables` / `updateVariablesWith` / `Mvu.replaceMvuData`

### 13.2 关键事务分类
以下流程在实现时必须被视为事务类 mutation，而不是普通字段编辑：
1. 背包 -> 正式卡牌整理
2. 删除正式卡牌 + 清理 `当前可见卡` 引用
3. battle 回合确认写入 `battle_session`
4. battle 完全放弃回滚
5. battle 终局提交回主热状态

每类事务都必须明确：输入快照、校验点、提交顺序、失败补偿 / 回滚策略。

### 13.3 战前快照范围合同
`prebattle_snapshot` 不能只写“保存快照”，必须在执行前冻结具体范围。

#### 快照必须包含
- 主热状态中会被战斗终局影响的字段：`主角`、`队伍`、`敌方`、`背包`、`世界.近期事务`
- `当前可见卡`（因为战斗期间会被锁定，放弃后应恢复锁定前视图）
- 当前楼层标识 / 来源信息

#### 快照默认不包含
- 聊天变量正式卡牌仓库全文
- 消息正文全文
- 历史 `CombatLog` / 历史 `DicePool`

#### 恢复语义
- 放弃：恢复快照并清空 `battle_session`
- 同层重开：恢复 `battle_session`，不是恢复快照
- 跨楼层重开：忽略旧 `battle_session`，按当前楼层数据重建

### 13.4 Prompt 合同
#### 普通聊天 prompt
允许输入：主热状态、当前可见卡摘要、普通检定骰池（若当轮存在）

禁止输入：正式卡牌仓库全文、`battle_session`、历史 `CombatLog`、历史 `DicePool`

#### battle 回合 prompt
允许输入：玩家当回合策略、玩家最终确认明骰、共享暗骰池当前状态、`battle_session` 中当前回合所需副本、轻量战斗规则摘要

禁止输入：与当前战斗无关的历史 battle 过程、正式卡牌仓库全文

#### 终局回写 prompt / 输出
只允许输出：战斗小结或全流程摘要文本、可提交的终局变量更新草案、掉落 / 近期事务 / 敌方清空所需结果

### 13.5 P2 扩展预留接口
即使 P2 不实现，P1 也要预留一个“特殊判定请求 envelope”概念位，避免未来重做战斗交互主链。

#### 占位合同
- `kind: 'special_check_request'`
- `visibility: 'public' | 'hidden'`
- `roll_count`
- `rerollable`
- `dc_or_threshold`
- `attribute_or_formula`
- `reason`

P1 只保留字段和流转位置，不实现执行器。

### 13.6 Verification ownership
- schema invariants：`executor` 实现，`verifier` 复核
- UI flow invariants：`designer` / `executor` 联合，`verifier` 复核
- prompt isolation invariants：`executor` 实现，`verifier` 复核
- rollback invariants：`executor` 实现，`test-engineer` 设计测试，`verifier` 收尾验收

---

## 14. Critic Resolution — canonical `battle_session` contract
若本节与前文 Option A / Scope Map / access guidance 冲突，以本节为准。

### 14.1 Updated decision: adopt Option D hybrid
首版不再采用“`battle_session` 在存储上独立于 canonical parsed schema 之外”的模糊表达，而是明确采用 **Option D hybrid**：

1. **canonical storage schema**
   - 根 `Schema` 必须显式包含可清空的 `battle_session` 字段
   - 这样 `util/mvu.ts` 的整对象 `safeParse -> write back` 周期不会把 `battle_session` 意外剥离
2. **product semantics**
   - `battle_session` 仍不属于普通状态栏主热状态
   - 普通状态栏 selector、日常 prompt、普通白名单更新都必须显式投影掉 `battle_session`
3. **execution semantics**
   - 同层恢复、跨楼层重建、删楼回退仍按 battle spec 执行
   - 只是把“语义临时态”与“存储存在性”明确拆开

### 14.2 Real option scorecard
| Option | unknown-key / field retention | multi-writer safety | same-layer resume / rebuild | prompt leakage control | repo utility fit | 结论 |
|---|---|---|---|---|---|---|
| A: schema 外临时字段 + 过滤 | 差 | 差 | 强 | 中 | 差 | 否决 |
| B: 主 schema + battle-only schema 双注册 | 中 | 中 | 强 | 强 | 中低 | 复杂备选 |
| C: 完全前端局部态 | 强 | 中 | 差 | 强 | 中 | 否决 |
| D: canonical schema 含 `battle_session` + 投影/事务隔离 | 强 | 强 | 强 | 强 | 强 | 采用 |

### 14.3 Full-write ownership
后续执行中，只有一个统一访问层模块允许提交完整 `stat_data`：
- 建议模块：`src/旅法师/脚本/MVU/state-access.ts`（名称可微调，但职责不可分裂）

#### 该模块唯一拥有的能力
1. fresh read 最新楼层 `stat_data`
2. merge/apply mutation
3. `Schema.safeParse`
4. commit `stat_data`
5. rollback / retry

#### 明确禁止
以下调用方不得直接做 full-object write：
- `界面/状态栏/store.ts`
- `界面/战斗浮窗/store.ts`
- 任意 Vue 组件
- 仓库管理面板组件
- 战斗组件

它们只能调用：
- `read selectors`
- `transaction / mutation facade`

### 14.4 Store contract
`defineMvuDataStore(...)` 在本项目中的角色收紧为：
- **read sync / projection store**，不是任意写入口

执行要求：
1. 状态栏 store 只暴露投影后的主热状态
2. battle store 只暴露 battle 视角投影
3. 组件层不直接改 `data.value` 触发整对象写回
4. 所有写入统一走 state-access / transaction facade

### 14.5 Concurrency-safe mutation model
每个关键 mutation 都必须遵循同一序列：
1. **fresh-read**：从最新楼层重新取 `stat_data`
2. **scope-guard**：确认当前 `source_message_id` / chat / battle 上下文仍匹配
3. **merge/apply**：只对目标事务范围做 patch / merge
4. **validate**：`Schema.safeParse`
5. **commit**：一次性提交
6. **post-check**：验证关键字段仍在
7. **rollback/retry**：失败则恢复或重试

### 14.6 Mandatory transaction classes
以下事务必须按 14.5 流程实现：
1. 主热状态编辑
2. 背包 -> 正式卡牌整理
3. 删除正式卡牌 + 清理 `当前可见卡`
4. battle 回合确认写入 `battle_session`
5. battle 完全放弃回滚
6. battle 终局提交回主热状态

### 14.7 Snapshot + message binding invariants
- `prebattle_snapshot` 必须记录 `source_message_id`
- `battle_session.meta.source_message_id` 必须成为“同层恢复 / 跨层重建”的主判据
- 若当前最新楼层 id 与 `source_message_id` 不同，则禁止直接续写旧 `battle_session`，必须重建

### 14.8 Expanded verification matrix
#### Unit
- `battle_session` 字段在 canonical schema 下 parse / re-parse 后保留
- 普通 selector 不暴露 `battle_session`
- 白名单更新不会误碰 `battle_session`

#### Integration
- 状态栏轮询后 `battle_session` 仍保留
- 战斗浮窗提交后普通主热状态未被污染
- 仓库事务与 battle 事务不会互相覆盖无关字段

#### E2E
1. 进入战斗 -> 提交 1 回合 -> 关闭浮窗 -> 同层重开恢复
2. 产生新楼层 -> 重开战斗 -> 按当前楼层重建
3. 放弃战斗 -> 精确恢复 snapshot 范围
4. 战斗终局 -> 清空 `敌方` / 写 `近期事务` / 清理 `battle_session`

#### Proof artifacts
- before/after variable snapshots
- `source_message_id` 变化证据
- prompt payload captures（normal / battle）
- rollback evidence

### 14.9 Phase-0 blocking deliverable update
“统一状态访问层”不再只是建议项，而是 **Phase 0 blocking deliverable**。若没有它，不得进入 battle 浮窗实现。
