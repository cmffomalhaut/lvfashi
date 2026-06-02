# 通用 AI 战斗前端接管入口

这份文档用于新聊天快速接管当前“通用 AI 战斗前端”方案，避免重新翻大量上下文。

## 1. 当前阶段
整体完成，但问题尚多

## 2. 已经敲定的关键结论

### 2.1 配置期和运行期必须分开

- 配置期允许把完整 `stat_data` 发给 AI 做字段分析
- 运行期正式战斗时，只发送选中的相关字段

### 2.2 正式战斗不全发 `stat_data`

前端应：
- 根据字段配置从完整 `stat_data` 抽出 `selected_data`
- 把精简后的 `selected_data` 发给 AI

### 2.3 字段勾选页必须能看完整路径树

不能只显示 AI 推荐结果。

玩家必须能：
- 看完整 `stat_data` 路径树
- 手动补选 AI 漏掉的字段

### 2.4 玩家指令高优先级

- 单回合模式：玩家本回合指令高优先级
- 快速整场模式：玩家整体战斗倾向高优先级

但不能违反：
- 战斗协议
- 资源限制
- 状态限制
- 环境限制

### 2.5 结算模式固定为三种

- `no_loot`
- `direct_loot`
- `checked_loot`

不要把“战斗结束后固定进入战利品阶段”写死。

### 2.6 MVU 更新由前端执行

AI 只返回：

```json
{
  "stat_data.xxx": "新值"
}
```

前端负责：
- 按路径 `set`
- 合并回当前 `stat_data`
- 再统一写回 MVU

不要改成：
- AI 返回 `op/add/remove`
- AI 直接操作 MVU

### 2.7 第一版默认整合策略

- 优先复用现有 `battle_session`
- 优先复用现有 `commit.ts`
- 优先复用现有事务边界

不要默认旁路现有战斗态。

### 2.8 第一版必须双模式完整支持

必须同时支持：
- `dice_driven`
- `freeform`

切到 `freeform`：
- 隐藏投骰子模块
- 隐藏暗骰模块

切回 `dice_driven`：
- 这两个模块重新启用

字段分析、单回合、快速整场、战利品四条链路都必须支持两种模式。

### 2.9 第一版非目标

- 不做多人协同
- 不做复杂可视化战斗回放
- 不做高级权限体系
- 不做特别重的 prompt 调试工作台
- 不做脱离 Tavern Helper + MVU 的独立宿主适配
- 当前要求之外的功能，第一版一律先不做

### 2.10 已确认的宿主与参考资料入口

当前这两个来源已经确认对后续实现有直接价值：

1. `.cursor/rules` 下与宿主约束直接相关的规则文档
2. `MoRanJiangHu` 参考项目的首轮筛选结果与重点文件

它们不是第一优先阅读入口，但在进入实现前值得补读。

### 2.11 文档取舍规则

当前 `docs/` 目录里有不少旧计划、旧草案、旧流程讨论文档。

新聊天默认不要先翻这些旧文档。

当前应视为“继续实现直接相关”的文档只有：

1. [通用AI战斗前端-接管入口.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-接管入口.md)
2. [通用AI战斗前端-执行计划.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-执行计划.md)
3. [通用AI战斗前端设计草案.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端设计草案.md)
4. [通用AI战斗前端-技术注意事项.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-技术注意事项.md)
5. [通用AI战斗前端-配置与协议数据模型.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-配置与协议数据模型.md)
6. [便宜模型参考项目筛选结果.md](E:/Gg/tavern_resource-main/docs/便宜模型参考项目筛选结果.md)

除此之外，`docs/` 里其他更早的计划、草稿、旧讨论，默认都不作为当前实现依据。

## 3. 目前最重要的文档

新聊天优先读这四份：

1. [通用AI战斗前端设计草案.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端设计草案.md)
2. [通用AI战斗前端-技术注意事项.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-技术注意事项.md)
3. [通用AI战斗前端-配置与协议数据模型.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-配置与协议数据模型.md)
4. [通用AI战斗前端-执行计划.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-执行计划.md)
5. [战斗/README.md](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/README.md)

如果是要继续筛外部参考项目，再看：

4. [便宜模型参考项目筛选任务.md](E:/Gg/tavern_resource-main/docs/便宜模型参考项目筛选任务.md)
5. [便宜模型参考项目筛选结果.md](E:/Gg/tavern_resource-main/docs/便宜模型参考项目筛选结果.md)

如果要开始正式实现，再补看这些宿主规则文档：

1. [项目基本概念.mdc](E:/Gg/tavern_resource-main/.cursor/rules/项目基本概念.mdc)
2. [mvu变量框架.mdc](E:/Gg/tavern_resource-main/.cursor/rules/mvu变量框架.mdc)
3. [mvu角色卡.mdc](E:/Gg/tavern_resource-main/.cursor/rules/mvu角色卡.mdc)
4. [酒馆变量.mdc](E:/Gg/tavern_resource-main/.cursor/rules/酒馆变量.mdc)
5. [酒馆助手接口.mdc](E:/Gg/tavern_resource-main/.cursor/rules/酒馆助手接口.mdc)
6. [前端界面.mdc](E:/Gg/tavern_resource-main/.cursor/rules/前端界面.mdc)
7. [脚本.mdc](E:/Gg/tavern_resource-main/.cursor/rules/脚本.mdc)

如果要继续借鉴 `MoRanJiangHu`，优先看这些文件：

1. [chatCompletionClient.ts](D:/电力系统综合实践资料给学生/新建文件夹/MoRanJiangHu-main/MoRanJiangHu-main/services/ai/chatCompletionClient.ts)
2. [VariableManager.tsx](D:/电力系统综合实践资料给学生/新建文件夹/MoRanJiangHu-main/MoRanJiangHu-main/components/features/Settings/VariableManager.tsx)
3. [responseCommandProcessor.ts](D:/电力系统综合实践资料给学生/新建文件夹/MoRanJiangHu-main/MoRanJiangHu-main/hooks/useGame/responseCommandProcessor.ts)
4. [ApiSettings.tsx](D:/电力系统综合实践资料给学生/新建文件夹/MoRanJiangHu-main/MoRanJiangHu-main/components/features/Settings/ApiSettings.tsx)
5. [PromptManager.tsx](D:/电力系统综合实践资料给学生/新建文件夹/MoRanJiangHu-main/MoRanJiangHu-main/components/features/Settings/PromptManager.tsx)

### 3.1 开始实现前最低阅读顺序

如果新聊天准备直接进入实现，建议按这个顺序读：

1. [战斗/README.md](E:/Gg/tavern_resource-main/src/旅法师/脚本/战斗/README.md)
2. [通用AI战斗前端-执行计划.md](E:/Gg/tavern_resource-main/docs/通用AI战斗前端-执行计划.md)
3. 上面列出的 `.cursor/rules/*.mdc` 宿主规则文档
4. 上面列出的 `MoRanJiangHu` 重点参考文件

这样通常就不需要再回头翻旧设计文档。

## 4. 当前建议的下一步

优先顺序建议：

1. 先拿“便宜模型”去筛独立前端参考项目里哪些文件值得参考
2. 看筛选结果后，再决定哪些原文件值得深入阅读
3. 先把 BattleFrontendSettings / BattleProfile 的实际存取层做出来
4. 再做字段勾选页与 `selected_data` 抽取逻辑

## 5. 新聊天建议开场语

如果后续开新聊天，建议直接这样说：

```text
先读 docs/通用AI战斗前端-接管入口.md，再继续当前通用 AI 战斗前端设计。只把接管入口里列出的文档当依据，不要先翻 docs 里其他旧计划文档。
```
