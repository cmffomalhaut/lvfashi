# Test Spec — 旅法师卡牌 / 状态栏 / 战斗辅助系统

## 1. 测试目标
为 PRD 中的 P0 / P1 / P2 制定可执行、可验证的验收规范，重点覆盖：
- 冷/热数据分层
- MVU 最新楼层读写
- AI 回写安全链路
- 战斗前后状态一致性
- 特殊判定的后置扩展边界

---

## 2. 测试策略
### 分层策略
- **Schema 层**：验证结构、清洗、默认值与幂等解析
- **状态同步层**：验证 latest 楼层读写、仓库/摘要同步、回写保护
- **流程层**：验证背包整理、主聊天普通检定、战斗投骰与终局流程
- **边界层**：验证非法更新、回滚、遮蔽、锁定与恢复

### 证据类型
- 结构化变量快照
- UI 行为记录
- 回写前后对比
- 失败流程的用户提示

---

## 3. P0 测试规格

### P0-T1 schema 与注册
**验证点**
- `Schema.parse(input)` 能产生合法热状态
- 二次 parse 结果稳定
- 动态集合不会因为数组索引导致维护混乱
- 变量结构注册脚本仅注册 `Schema`

**通过标准**
- 不依赖 old/new diff 即可完成结构定义与清洗

### P0-T2 latest 楼层访问
**验证点**
- 状态栏始终读取最新楼层
- 新楼层生成后，状态栏不继续绑定旧楼层
- 初始化时未就绪状态不会触发错误读写

**通过标准**
- latest / -1 语义稳定工作

### P0-T3 仓库与当前可见区
**验证点**
- 正式卡牌写入聊天变量而非 MVU 全量热数据
- 当前可见区只复制摘要进 MVU
- prompt 构建不泄漏完整仓库
- 删除卡牌后相关摘要与引用被清理

**通过标准**
- 仓库与摘要分层清晰

### P0-T4 主聊天 AI 回写安全
**验证点**
- 合法路径更新可成功写回
- 非法路径被拒绝并提示
- HP/MP 不会写成负数
- 自建 AI 请求后必须手动 parse/replace 才会生效

**通过标准**
- 非法更新零静默失败

### P0-T5 背包整理事务性
**验证点**
- 整理成功：写仓库 + 背包数量扣减
- 整理失败：仓库不写入 + 背包不扣减
- 失败时玩家得到清晰提示

**通过标准**
- 无半成功状态

### P0-T6 DicePool / CombatLog 遮蔽
**验证点**
- 历史 `<DicePool>` 不进入后续 AI 上下文
- 历史 `<CombatLog>` 不进入后续 AI 上下文
- 普通检定走 one-shot 骰子池裁定方案

**通过标准**
- 无历史随机源与战斗记录污染

### P0 Exit Criteria
- 所有 P0 验证点通过
- latest 楼层语义稳定
- 回写安全链路可复用给 P1

---

## 4. P1 测试规格

### P1-T1 战斗入口与快照
**验证点**
- 从 `敌方` 可正常进入战斗浮窗
- 战前快照保存成功
- 放弃 / 关闭战斗能恢复战前状态

### P1-T2 单次检定交互
**验证点**
- 玩家先输入策略
- 投骰结果可见
- 每次检定最多 3 次重 roll
- 玩家确认最终骰面后才发给 AI

### P1-T3 AI 推演与回合回写
**验证点**
- AI 负责数值推演
- 脚本不硬编码完整战斗结算
- 中间回合不写主楼层 CombatLog
- 回合回写后 MVU 热状态一致

### P1-T4 终局处理
**验证点**
- 战斗结束后才追加 CombatLog
- `敌方` 被清空
- `世界.近期事务` 被覆盖
- 相关锁定被释放

### P1 Exit Criteria
- 战斗可以完整开始、进行、放弃、结束
- 骰面确认 -> AI 推演顺序稳定
- 终局回写完整且无中途污染

---

## 5. P2 测试规格

### P2-T1 手动特殊判定
**验证点**
- 支持至少一种高难度特殊判定
- 支持暗骰或多次检定中的至少一种
- 不破坏普通 P1 投骰主流程

### P2-T2 AI 结构化申请特殊判定
**验证点**
- AI 只能提交结构化请求，不能直接执行脚本逻辑
- 请求可表达：次数、属性、DC、是否暗骰、是否可重掷
- 前端执行结果可安全回传 AI

### P2 Exit Criteria
- 特殊判定机制可独立启用/禁用
- 不影响普通战斗流程稳定性

---

## 6. 关键回归集
1. 最新楼层读写回归
2. 仓库 / 可见区 / 摘要分层回归
3. 非法 AI 更新拦截回归
4. 背包整理回滚回归
5. 战前快照恢复回归
6. 战斗终局 CombatLog / 敌方 / 近期事务回归

---

## 7. 阻塞判定
出现以下任一情况，阶段不得宣告完成：
- 状态栏仍可能写错到旧楼层
- 仓库内容直接泄漏进 prompt
- 非法 AI 更新未被阻断
- 背包整理存在半成功状态
- 战斗中途污染主楼层 CombatLog
- 特殊判定对 P1 主流程造成不稳定影响


## 8. Mandatory Proof Artifacts
Before any stage is declared complete, collect at minimum:
1. Before/after variable snapshots for each critical transaction class
2. Illegal-path rejection evidence
3. Backpack-promotion rollback evidence
4. Battle-abort rollback evidence
5. Prompt-isolation evidence for normal chat and battle prompts
6. Battle interaction order evidence for strategy -> roll -> reroll decision -> confirm -> AI push
