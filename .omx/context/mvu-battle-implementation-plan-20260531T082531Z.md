# Context Snapshot — mvu-battle-implementation-plan

## Task statement
基于现有 spec、battle spec、MVU 骨架和 `deep-interview-ralplan-handoff-mvu-battle.md`，生成详细实施计划。

## Desired outcome
- 产出一份可以直接指导后续 `$ultragoal` / `$team` / `$ralph` 执行的详细实施计划
- 明确 P0 / P1 / P2 的边界、依赖、文件落点、验证路径
- 明确哪些字段属于主 `schema.ts`，哪些属于临时战斗态，哪些不进入 MVU / prompt

## Known facts / evidence
- 基线需求：`.omx/specs/deep-interview-docs-requirements-srs.md`
- 战斗补充规格：`.omx/specs/deep-interview-battle-flow-p1.md`
- MVU handoff：`.omx/specs/deep-interview-ralplan-handoff-mvu-battle.md`
- 现有 PRD / test spec：`.omx/plans/prd-docs-requirements-srs.md`、`.omx/plans/test-spec-docs-requirements-srs.md`
- 现有较泛化详细计划：`.omx/specs/ralplan-detailed-implementation-plan-docs-requirements-srs.md`
- MVU store 工具：`util/mvu.ts`
- MVU schema 注册工具：`util/mvu_zod.ts`
- iframe / script 挂载工具：`util/script.ts`
- 模板骨架：`初始模板/角色卡/新建为src文件夹中的文件夹/*`
- 示例骨架：`示例/角色卡示例/*`

## Constraints
- 当前处于 `$ralplan` 规划态，不进入实现改码
- 只允许写 planning artifacts / state artifacts
- 必须遵守 battle spec 对 `battle_session` 的时效性、楼层跟随、终局回写边界
- 必须遵守 MVU 规则：结构校验、latest/-1 语义、`schema.ts` 幂等解析

## Key design tension
`battle_session` 被定义为 message 级临时战斗工作区，但实现上仍需可恢复、可重建、可按楼层回退。需要在“数据隔离”与“随楼层持久化”之间取平衡。

## Working inference
基于 battle spec 第 7.15 / 7.16 节，最佳首版方案是：
- **语义上**：`battle_session` 不算主角色卡常驻热状态，不进入普通状态栏与日常 prompt
- **存储上**：仍暂存于当前楼层 `stat_data` 的独立命名空间，便于同层恢复、跨楼层重建、删楼回退

这是一条从现有规格推得的实现性推论，不是原文逐字规定；后续需经 architect / critic 审核确认。

## Likely codebase touchpoints
- `src/旅法师/`（建议的新角色卡根目录）
- `src/旅法师/schema.ts`
- `src/旅法师/脚本/变量结构/index.ts`
- `src/旅法师/脚本/MVU/index.ts`
- `src/旅法师/脚本/战斗/index.ts`
- `src/旅法师/界面/状态栏/*`
- `src/旅法师/界面/战斗浮窗/*`
- `src/旅法师/世界书/变量/*`
- `util/mvu.ts`
- `util/mvu_zod.ts`
- `util/script.ts`

## Unknowns / open questions
- `battle_session` 最终是并入主 `Schema` 的可清空字段，还是使用 battle-only schema 注册层
- 自建 AI 请求封装优先复用哪个现成 util / feature 模式
- 卡牌仓库具体聊天变量字段名是否需要与现有其他脚本兼容
