# 通用 AI 战斗前端执行计划

这份文档用于持续记录“通用 AI 战斗前端”目前已经完成了什么、还缺什么、下一步该做什么。

用途：
- 新聊天快速判断当前进度
- 避免重复讨论已经敲定的问题
- 便于后续每完成一项就勾掉或移动

维护规则：
- 已完成的内容保留在“已完成”区
- 尚未开始或未完成的内容放在“待实现”区
- 某项完全做完后，从“待实现”移到“已完成”
- 如果某项方案被废弃，直接从待实现删除，并在“变更记录”写明

---

## 1. 当前总目标

在 Tavern Helper + MVU 宿主下，做一个可跨项目复用的通用 AI 战斗前端。

该前端应支持：
- 自定义 API / Key / 模型
- 自定义战斗协议和 prompt
- 从当前消息楼层 `stat_data` 做字段分析
- 玩家手动调整字段勾选
- 正式战斗时仅发送 `selected_data`
- 支持单回合、快速整场、战利品结算
- AI 返回结构化 JSON
- 前端按路径合并并写回 MVU

---

## 2. 当前阶段

当前处于：
- 设计完成度较高
- 已开始正式功能实现

当前状态判断：
- 产品边界已基本确定
- 数据模型已初步落地
- 外部参考项目已完成首轮筛选
- 已完成设置存取层的正式编码
- 已完成 API 配置模块的正式编码
- 已完成 Prompt 配置模块的正式编码
- 已完成战斗规则配置模块的正式编码
- 已完成字段分析调用层的正式编码
- 已完成字段勾选树 UI 的正式编码
- 已完成 `selected_data` 抽取器的正式编码
- 已完成正式 AI 请求层的正式编码
- 单回合战斗执行链、快速整场执行链、战利品结算执行链、写回层仍未开始

---

## 2.1 当前执行硬约束

这部分来自本轮深访，后续默认按这里执行，除非用户明确推翻。

### 第一版范围

第一版按完整主链执行，不走最小验证版。

第一版目标包含：
- 设置存取层
- API 配置模块
- Prompt 配置模块
- 战斗规则配置模块
- 字段分析调用层
- 字段勾选树 UI
- `selected_data` 抽取器
- AI 请求层
- 单回合战斗执行链
- 快速整场执行链
- 战利品结算执行链
- 扁平路径更新校验与 MVU 写回层
- 与现有 `battle_session` 的整合

### 默认整合策略

第一版默认采用：
- 优先复用现有 `battle_session`
- 优先复用现有 `commit.ts`
- 优先复用现有事务边界

新通用前端主要新增：
- 配置层
- Prompt 管理层
- AI 协议层
- 字段分析与字段抽取层

不默认采用：
- 完全旁路现有战斗态
- 先独立造一套新的完整战斗状态机

### 双模式支持要求

第一版必须同时完整支持：
- `dice_driven`
- `freeform`

切换要求：
- 切到 `freeform` 后，投骰子模块和暗骰模块必须隐藏
- 切回 `dice_driven` 后，投骰子模块和暗骰模块必须重新启用

以下四条链路都必须支持两种模式：
- 字段分析
- 单回合战斗
- 快速整场
- 战利品结算

### 默认协作边界

大多数实现细节可由代理直接决定，不需要每次询问。

只有当出现这种情况时需要停下：
- 同类错误反复 2-3 次仍无法稳定解决
- 或必须推翻此前已经确定的协议和使用方式

### 第一版明确不做

- 不做多人协同
- 不做复杂可视化战斗回放
- 不做高级权限体系
- 不做特别重的 prompt 调试工作台
- 不做脱离 Tavern Helper + MVU 的独立宿主适配
- 当前要求之外的其他扩展功能，第一版一律先不做

---

## 3. 已完成

### 3.1 代码与现有系统阅读

- 已阅读当前项目战斗脚本目录：
  - `src/旅法师/脚本/战斗/index.ts`
  - `src/旅法师/脚本/战斗/session.ts`
  - `src/旅法师/脚本/战斗/prompt.ts`
  - `src/旅法师/脚本/战斗/resolve.ts`
  - `src/旅法师/脚本/战斗/commit.ts`
  - `src/旅法师/脚本/战斗/snapshot.ts`

- 已确认当前战斗底座依赖：
  - `src/旅法师/schema.ts`
  - `src/旅法师/脚本/MVU/state-access.ts`

- 已阅读 `.cursor/rules` 中与 MVU、酒馆变量、脚本、前端相关规则

### 3.2 已确认的核心设计结论

- 已确定配置期和运行期必须分离
- 已确定配置期允许发送完整 `stat_data` 做字段分析
- 已确定运行期正式战斗只能发送抽取后的 `selected_data`
- 已确定字段勾选页必须能浏览完整 `stat_data` 路径树
- 已确定玩家手动补选字段是刚需
- 已确定玩家指令在单回合和快速模式下都必须高优先级
- 已确定结算模式统一为：
  - `no_loot`
  - `direct_loot`
  - `checked_loot`
- 已确定 MVU 更新由前端执行
- 已确定 AI 不返回 `op/add/remove`
- 已确定 AI 只返回 `"stat_data.xxx" -> 新值`
- 已确定世界书、楼层、环境上下文属于可选增强
- 已确定 `schema.ts` 是可选辅助，不是第一版强依赖

### 3.3 Prompt 方向已定

- 已确定需要四类 prompt：
  - 字段分析 prompt
  - 单回合战斗 prompt
  - 快速整场战斗 prompt
  - 战利品结算 prompt

- 已讨论并固定这些 prompt 的原则：
  - 单回合模式只处理当前回合
  - 快速模式一次性推演到结束
  - 战利品不是固定阶段，而是结算模式之一
  - 玩家意图要高优先级写进 prompt 约束

### 3.4 外部参考项目筛选已完成

- 已针对 `MoRanJiangHu` 做第一轮参考价值筛选
- 已确认值得后续重点参考的文件方向：
  - AI 请求封装
  - API 设置页
  - Prompt 设置页
  - 变量树/路径编辑器
  - 路径命令处理流程

当前优先参考文件已明确为：
- `services/ai/chatCompletionClient.ts`
- `components/features/Settings/VariableManager.tsx`
- `hooks/useGame/responseCommandProcessor.ts`
- `components/features/Settings/ApiSettings.tsx`
- `components/features/Settings/PromptManager.tsx`

### 3.5 文档沉淀已完成

已新增或整理以下文档：

- [通用AI战斗前端设计草案.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端设计草案.md)
- [通用AI战斗前端-技术注意事项.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-技术注意事项.md)
- [通用AI战斗前端-配置与协议数据模型.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-配置与协议数据模型.md)
- [通用AI战斗前端-接管入口.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-接管入口.md)
- [便宜模型参考项目筛选任务.md](E:/Gg/tavern_resource-main/docs/便宜模型参考项目筛选任务.md)
- [便宜模型参考项目筛选结果.md](E:/Gg/tavern_resource-main/docs/便宜模型参考项目筛选结果.md)
- [战斗 README.md](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/README.md)

当前继续实现时应默认以这些文档为准，不必先翻 `docs/` 下更早的旧计划或旧讨论文档。

### 3.5.1 宿主规则资料已确认

后续实现时应优先参考这些 `.cursor/rules` 文档：

- `.cursor/rules/项目基本概念.mdc`
- `.cursor/rules/mvu变量框架.mdc`
- `.cursor/rules/mvu角色卡.mdc`
- `.cursor/rules/酒馆变量.mdc`
- `.cursor/rules/酒馆助手接口.mdc`
- `.cursor/rules/前端界面.mdc`
- `.cursor/rules/脚本.mdc`

### 3.6 类型草案已落地

已新增：
- [ai-profile.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/ai-profile.ts)

当前已定义的核心类型包括：
- `BattleFrontendSettings`
- `BattleApiProfile`
- `BattleProfile`
- `BattleFieldSelectionConfig`
- `BattlePromptConfig`
- `BattleFieldAnalysisPayload / Result`
- `BattleRuntimePayload`
- `BattleRoundResult`
- `BattleFullResult`
- `BattleLootResult`

---

### 3.7 深访结论已补齐

- 已确定第一版必须直接做完整主链，不走最小验证范围
- 已确定第一版默认优先复用现有 `battle_session` / `commit.ts` / 事务边界
- 已确定第一版必须同时支持 `dice_driven` 和 `freeform`
- 已确定 `freeform` 下隐藏投骰子模块与暗骰模块
- 已确定两种模式下四条链路都必须完整可用
- 已确定第一版明确非目标列表
- 已确定“同类错误反复 2-3 次仍无法稳定解决”是必须停下的触发条件

### 3.8 `BattleFrontendSettings` 存取层已落地

- 已新增：
  - [frontend-settings.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/frontend-settings.ts)

- 已补齐：
  - [ai-profile.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/ai-profile.ts) 的默认值工厂与设置版本常量

- 当前存取层已实现：
  - `BattleFrontendSettings` 的 zod schema 与默认值初始化
  - 以脚本变量 `battle_frontend_settings` 为落点的统一读写入口
  - 兼容旧根对象形态的基础迁移入口
  - `api_profiles` / `battle_profiles` 的保存、删除、激活切换
  - 当前激活 API / 战斗配置的读取辅助
  - 基于内存 bindings 的可测试 access 工厂

- 已确认边界：
  - 长期配置不写入消息楼层 `stat_data`
  - 长期配置不混入 `battle_session`

### 3.9 API 配置模块已落地

- 已新增：
  - [api-client.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/api-client.ts)

- 已补齐：
  - [store.ts](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/store.ts) 的 API 配置状态与操作
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的最小可用 API 设置界面
  - [global.css](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/global.css) 的 API 设置区样式

- 当前 API 配置模块已实现：
  - `base_url / api_key / model / model_fetch_path / timeout / retry_limit` 的编辑入口
  - 多个 API 配置的创建、保存、删除与激活切换
  - 基于 OpenAI 兼容接口的模型列表拉取
  - 基于 `/chat/completions` 的连接测试
  - 最近一次测试结果 `last_test_result` 的持久化回写

- 当前边界：
  - 只完成最小可用设置界面，不含完整 Prompt 管理页
  - 只先覆盖 OpenAI 兼容链路，不扩展更多厂商专用协议

### 3.10 Prompt 配置模块已落地

- 已补齐：
  - [store.ts](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/store.ts) 的战斗配置状态与操作
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的 Prompt 配置界面
  - [global.css](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/global.css) 的 Prompt 编辑区样式

- 当前 Prompt 配置模块已实现：
  - 四类 Prompt 的固定编辑入口：
    - `field_analysis`
    - `single_round`
    - `full_battle`
    - `loot_resolution`
  - 每类 Prompt 独立编辑：
    - `system_prompt`
    - `user_prompt`
    - `output_contract_prompt`
    - `notes`
    - `version`
  - 基于 `BattleProfile` 的多套战斗配置创建、保存、删除与激活切换
  - 每类 Prompt 的启用/禁用切换
  - 当前 Prompt 配置 JSON 的导入与导出

- 当前边界：
  - 只完成最小可用 Prompt 管理界面，不含更重的调试工作台
  - Prompt 导入导出仅覆盖当前战斗配置的 `prompts` 结构，不含整套战斗规则与字段配置打包

- 参考项目对照后已顺手补齐一项 API 层兼容性修正：
  - `api-client.ts` 现已兼容 `base_url` 填写为 `.../v1`、`.../chat/completions`、`.../v1/models` 等常见形式，避免拼接出错误路径

### 3.11 战斗规则配置模块已落地

- 已补齐：
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的战斗规则编辑区
  - [store.ts](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/store.ts) 的战斗配置持久化复用
  - [global.css](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/global.css) 的规则配置区样式

- 当前战斗规则配置模块已实现：
  - `run_mode / default_turn_mode / settlement_mode` 的编辑入口
  - `battle_protocol / loot_protocol / extra_world_rules` 的编辑入口
  - `allow_full_stat_data_in_analysis / forbid_full_stat_data_in_runtime / schema_hint_enabled` 的编辑入口
  - 保持 `player_intent_priority = high` 的固定边界展示

- 当前边界：
  - 只完成配置层编辑，不包含后续运行时 UI 分支切换逻辑
  - `freeform` 隐藏投骰子与暗骰模块的真正界面切换，留待正式运行链路阶段接入

### 3.12 字段分析调用层已落地

- 已新增：
  - [field-analysis.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/field-analysis.ts)

- 已补齐：
  - [api-client.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/api-client.ts) 的最小可复用聊天请求入口
  - [store.ts](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/store.ts) 的字段分析状态与执行入口
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的字段分析调用与结果展示

- 当前字段分析调用层已实现：
  - 从当前消息楼层 `stat_data` 读取主状态投影作为分析输入
  - 组装 `BattleFieldAnalysisPayload`
  - 读取当前战斗配置里的 `field_analysis` prompt 并请求当前绑定 API
  - 解析结构化 `fields[] / warnings[]`
  - 将分析结果写回当前 `BattleProfile.field_selection`
  - 对 AI 返回路径做基础归一化：
    - 去掉 `stat_data.` 前缀
    - 去重
    - 空 label 自动回退到路径末段

- 当前边界：
  - `worldbook_context` 仍先留空，未接世界书增强
  - 只完成“调用 + 保存 + 展示建议结果”，完整路径树浏览和人工补选留到下一阶段
  - 当前只走 OpenAI 兼容聊天请求，不含更多厂商特化协议

### 3.13 字段勾选树 UI 已落地

- 已新增：
  - [FieldTreeNode.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/FieldTreeNode.vue)
  - [field-selection.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/field-selection.ts)

- 已补齐：
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的完整路径树浏览与勾选管理
  - [global.css](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/global.css) 的字段树与勾选列表样式

- 当前字段勾选树 UI 已实现：
  - 浏览当前完整 `stat_data` 路径树
  - 从路径树直接加入勾选字段
  - 手动输入路径补选字段
  - 已选字段的启用/禁用、删除、`label` / `reason` 编辑
  - 保留字段来源与 `value_kind`

- 当前边界：
  - 展开状态暂未接入 `ui_preferences` 持久化
  - 目前只在当前战斗配置草稿里编辑，仍需用户保存后才会持久化

### 3.14 `selected_data` 抽取器已落地

- 已补齐：
  - [field-selection.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/field-selection.ts) 的字段抽取逻辑
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的 `selected_data` 实时预览

- 当前 `selected_data` 抽取器已实现：
  - 按启用字段列表从当前完整 `stat_data` 抽取嵌套精简数据
  - 缺失路径会生成可见警告
  - 正式运行请求已改为基于 `selected_data` 预览发送，而不是全发 `stat_data`

- 当前边界：
  - 目前仍是前端侧实时预览，尚未接到后续单回合执行链的状态推进

### 3.15 AI 请求层已落地

- 已新增：
  - [runtime-ai.ts](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/runtime-ai.ts)

- 已补齐：
  - [store.ts](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/store.ts) 的三类正式请求入口
  - [App.vue](E:/Gg/tavern_resource-main/src/旅法师/界面/战斗浮窗/App.vue) 的请求实验区

- 当前 AI 请求层已实现：
  - 单回合请求发送与结构化解析
  - 快速整场请求发送与结构化解析
  - 战利品结算请求发送与结构化解析
  - 统一复用 OpenAI 兼容聊天请求入口与基础错误处理/重试
  - 保留最近一次运行 payload 和解析结果

- 当前边界：
  - 这里只完成“发送并解析结果”，未接入现有 `battle_session` 状态机
  - 结果仍作为实验区展示，真正的战斗状态写回留待执行链阶段

---

## 4. 待实现

### 4.9 单回合战斗执行链

状态：
- 未开始

目标：
- 根据 `BattleProfile` 构造运行请求
- 接收 `BattleRoundResult`
- 展示结果
- 准备写回更新

完成标准：
- 能发起一次单回合战斗
- 能展示摘要和叙述
- 能识别 `battle_end`
- 能保留本回合更新项

### 4.10 快速整场执行链

状态：
- 未开始

目标：
- 发起整场推演
- 接收 `BattleFullResult`
- 展示每回合摘要和最终战报

完成标准：
- 能一键推演到战斗结束
- 能整场重跑
- 不支持中途抽单回合返工

### 4.11 战利品结算执行链

状态：
- 未开始

目标：
- 根据结算模式决定是否进入掉落流程
- 处理 `no_loot` / `direct_loot` / `checked_loot`

完成标准：
- `no_loot` 不进入掉落
- `direct_loot` 可直接拿结果
- `checked_loot` 需额外触发检定/结算

### 4.12 扁平路径更新校验与 MVU 写回层

状态：
- 未开始

目标：
- 校验 AI 返回路径是否合法
- 将更新按路径合并回当前 `stat_data`
- 统一写回 MVU

完成标准：
- 只接受 `stat_data.` 开头路径
- 不允许 `op/add/remove`
- 能集中处理写回错误

### 4.13 与现有 `battle_session` 的整合策略

状态：
- 未开始

目标：
- 将新通用配置层和 AI 协议层接入现有 `battle_session` 流程
- 复用现有事务态和提交层边界

当前倾向：
- 优先复用现有事务边界

完成标准：
- 明确适配层位置
- 明确哪些流程沿用现有 `session.ts / commit.ts`
- 明确哪些流程走新配置体系

### 4.14 调试与回显工具

状态：
- 未开始

目标：
- 查看发送给 AI 的实际 payload
- 查看 AI 原始文本和解析后 JSON

完成标准：
- 能快速定位格式错误
- 能支持重试和调 prompt

---

## 5. 当前推荐实现顺序

按依赖关系，建议执行顺序如下：

1. 单回合战斗执行链
2. 快速整场执行链
3. 战利品结算执行链
4. 扁平路径更新校验与 MVU 写回层
5. 与现有 `battle_session` 的整合
6. 调试与回显工具

---

## 6. 当前建议的最近一步

最近一步建议固定为：

1. 先实现单回合战斗执行链

原因：
- 配置期主链已经具备最小可用闭环
- 下一步应把单回合请求结果真正接回现有战斗流程，而不是只停留在实验区发请求

做完这一步后，下一步应切到：

2. 快速整场执行链

---

## 6.1 第一版完成定义

第一版完成的最低标准：

- 执行计划中的 `1-13` 全部完成
- 用户可以在 Tavern Helper + MVU 宿主内实际走完整主链
- 两种模式都能实际使用：
  - `dice_driven`
  - `freeform`
- `freeform` / `dice_driven` 切换行为符合既定要求
- 正式战斗运行时不再全发完整 `stat_data`
- AI 返回结果能稳定写回 MVU

以下内容可以不阻塞第一版完成：
- `14 调试与回显工具`

以下任一情况出现，应判定为未完成或不可交付：
- 不能稳定从当前消息楼层读到 `stat_data`
- 字段分析结果不能被玩家手动修正
- 正式战斗仍在全发完整 `stat_data`
- AI 返回后不能稳定写回 MVU
- 快速整场链路根本跑不通
- 战利品结算链路根本跑不通
- API 请求失败，且无法使用酒馆默认 API 链接

---

## 7. 变更记录

### 2026-06-01

- 建立执行计划文档
- 固定“已完成 / 待实现 / 最近一步”维护方式
- 记录当前尚处于设计完成、实现未启动阶段
- 补入深访后的执行硬约束、第一版范围、非目标、双模式要求、失败条件和停机触发条件
- 完成 `BattleFrontendSettings` 存取层，并将“最近一步”推进到 API 配置模块
- 完成 API 配置模块，并将“最近一步”推进到 Prompt 配置模块
- 完成 Prompt 配置模块，并将“最近一步”推进到战斗规则配置模块
- 完成战斗规则配置模块与字段分析调用层，并将“最近一步”推进到字段勾选树 UI
- 完成字段勾选树 UI、`selected_data` 抽取器与 AI 请求层，并将“最近一步”推进到单回合战斗执行链
