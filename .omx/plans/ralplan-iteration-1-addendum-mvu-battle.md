# Ralplan Iteration 1 Addendum — mvu-battle

## Source of iteration
本轮加严来自架构审查的 6 条修正意见，核心是把“文档上正确”收紧到“执行上不易分叉”。

## 已补入主计划的修正
1. **单一状态访问合同**
   - 明确后续实现不得让状态栏、战斗浮窗、仓库管理各自直写底层变量
2. **关键事务分类**
   - 明确背包整理、卡牌删除清理、battle 确认写入、battle 放弃回滚、battle 终局提交都是事务类 mutation
3. **战前快照范围合同**
   - 明确哪些字段进入 `prebattle_snapshot`，哪些不进入
4. **Prompt 合同**
   - 拆分普通聊天 prompt、battle 回合 prompt、终局回写 prompt 的允许 / 禁止输入
5. **P2 预留接口**
   - 增补“特殊判定请求 envelope”作为 P1 留口，不在 P1 实现
6. **验证归属**
   - 明确 schema / UI / prompt / rollback 的未来验证角色归属

## 影响
- 计划未扩大范围，但显著降低了执行阶段出现多写路径、快照语义漂移、prompt 拼装分叉的风险。
- `battle_session` 的单字段方案仍保留，但现在附带更严格的过滤、快照和事务约束。

## 对后续 handoff 的含义
若进入执行模式，建议把“统一状态访问层”作为 P0 第一优先抽象，而不是把它留到收尾重构。
