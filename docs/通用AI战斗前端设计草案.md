# 通用 AI 战斗前端设计草案

本文档用于沉淀当前已经讨论确认的通用 AI 战斗前端方案，作为后续实现的设计基线。

适用前提：
- 宿主环境为 Tavern Helper + MVU。
- 主要战斗数据来源于消息楼层变量中的 `stat_data`。
- 战斗规则通过 prompt / 协议文本驱动。
- AI 负责字段分析、战斗推演、战利品结算。
- 前端负责配置、抽取字段、渲染结果、合并并写回 MVU。

## 1. 目标

做一个可跨项目复用的战斗前端框架。

通用部分：
- 战斗设置页
- API / Key / 模型配置
- 战斗协议配置
- AI 字段分析
- 字段勾选配置
- 单回合战斗
- 快速整场战斗
- 战利品结算
- MVU 写回

项目差异部分：
- `stat_data` 内部结构
- 字段命名
- 战斗协议文本
- 战利品规则文本
- 世界书与环境上下文来源

核心思路：
- 配置阶段允许把完整 `stat_data` 发给 AI 做字段分析。
- 正式战斗阶段只发送选中的相关字段，不再全发。

## 2. 数据来源与宿主约束

### 2.1 MVU 数据入口

主要数据入口是消息楼层变量中的 `stat_data`。

典型读取方式：

```ts
await waitGlobalInitialized('Mvu');
const variables = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
const stat_data = _.get(variables, 'stat_data');
```

### 2.2 初始化要求

使用 MVU 的脚本或前端界面应先：

```ts
await waitGlobalInitialized('Mvu');
```

前端界面通常还应等待当前消息楼层存在 `stat_data`：

```ts
await waitUntil(() => _.has(getVariables({ type: 'message' }), 'stat_data'));
```

### 2.3 schema.ts

`schema.ts` 是可选辅助项，不强依赖。

如果项目提供了 `schema.ts`，可用于：
- 帮助理解 `stat_data` 结构
- 在前端写回前做校验
- 后续增强分析稳定性

如果没有，则系统仍可依赖原始 `stat_data` 运行。

## 3. 整体流程

系统分为两个主要阶段：

### 3.1 配置阶段

1. 玩家填写战斗协议文本。
2. 前端读取当前完整 `stat_data`。
3. 前端把战斗协议和完整 `stat_data` 发给 AI 做字段分析。
4. AI 返回正式战斗需要的字段路径。
5. 前端自动勾选字段。
6. 玩家手动修正、补充、取消。
7. 保存为战斗配置。

### 3.2 正式战斗阶段

1. 前端按已选字段路径从完整 `stat_data` 中抽取精简数据。
2. 前端拼接战斗协议、精简数据、玩家指令、骰子输入、世界书上下文、环境上下文。
3. AI 执行单回合或快速整场战斗推演。
4. AI 返回结构化结果。
5. 前端按返回的更新字段合并到当前 MVU 数据。
6. 如结算模式为 `checked_loot`，再进入战利品检定 / 结算。

## 4. 分析阶段协议

### 4.1 输入 payload

```json
{
  "task": "analyze_battle_fields",
  "run_mode": "dice_driven",
  "battle_protocol": "string",
  "stat_data": {},
  "worldbook_context": [],
  "extra_instructions": ""
}
```

字段说明：
- `task`: 固定为字段分析任务
- `run_mode`: `dice_driven` 或 `freeform`
- `battle_protocol`: 当前战斗协议文本
- `stat_data`: 当前完整战斗数据源
- `worldbook_context`: 可选世界书补充内容
- `extra_instructions`: 玩家额外说明

### 4.2 输出结构

```json
{
  "fields": [
    {
      "path": "stat_data.xxx",
      "label": "字段显示名称",
      "reason": "为什么这个字段与战斗直接相关"
    }
  ],
  "warnings": ["string"]
}
```

字段说明：
- `fields`: AI 推荐用于正式战斗的数据路径
- `warnings`: 路径不确定、缺少骰子输入、环境信息不足等提示

### 4.3 设计原则

- 这一步允许发送完整 `stat_data`。
- 这一步不是战斗推演，只用于筛字段。
- 路径必须完整且以 `stat_data.` 开头。
- 玩家后续必须能手动修正。

## 5. 字段勾选配置

### 5.1 保存结构

```json
{
  "field_selection": {
    "selected_fields": [
      {
        "path": "stat_data.主角.当前化身",
        "label": "主角当前化身",
        "enabled": true,
        "source": "ai",
        "reason": "包含玩家当前战斗主体信息"
      }
    ],
    "warnings": ["string"]
  }
}
```

字段说明：
- `path`: 完整路径
- `label`: 前端显示名称
- `enabled`: 是否启用
- `source`: `ai` 或 `manual`
- `reason`: AI 推荐理由或玩家备注

### 5.2 前端要求

字段勾选页不能只显示 AI 推荐结果。

必须同时展示：
- 已选字段列表
- 当前完整 `stat_data` 的可浏览路径树

这样玩家才能：
- 取消 AI 误选
- 从完整树中补选遗漏字段
- 手动新增路径

## 6. 正式战斗请求协议

### 6.1 请求 payload

```json
{
  "task": "run_battle",
  "run_mode": "dice_driven",
  "turn_mode": "round_based",
  "battle_protocol": "string",
  "selected_data": {},
  "player_command": "",
  "dice_inputs": {},
  "worldbook_context": [],
  "environment_context": {},
  "extra_instructions": ""
}
```

字段说明：
- `task`: 固定为正式战斗任务
- `run_mode`: `dice_driven` 或 `freeform`
- `turn_mode`: `round_based` 或 `full_battle`
- `battle_protocol`: 当前战斗协议
- `selected_data`: 从完整 `stat_data` 抽出的精简战斗数据树
- `player_command`: 玩家指令
- `dice_inputs`: 骰子输入
- `worldbook_context`: 可选世界书上下文
- `environment_context`: 可选楼层、环境上下文
- `extra_instructions`: 玩家额外说明

### 6.2 核心原则

- 正式战斗阶段不再全发完整 `stat_data`。
- 只发送精简后的 `selected_data`。
- 玩家指令在单回合和快速模式下都应高优先级处理。

## 7. 单回合返回结构

```json
{
  "result_type": "round",
  "battle_state": "ongoing",
  "round_index": 1,
  "summary": "",
  "narration": "",
  "selected_data_updates": {},
  "status_changes": [],
  "resource_changes": [],
  "battle_end": false,
  "battle_end_reason": "",
  "settlement": {
    "mode": "no_loot",
    "mvu_commit_ready": false,
    "loot_ready": false,
    "loot_context": {},
    "check_prompt_needed": false
  },
  "warnings": []
}
```

字段说明：
- `summary`: 当前回合简短摘要
- `narration`: 当前回合详细叙述
- `selected_data_updates`: 本回合要写回的战斗相关字段更新
- `status_changes`: 重要状态变化
- `resource_changes`: 资源变化
- `battle_end`: 本回合后是否结束
- `settlement`: 若结束则给出结算方式与后续提示

设计原则：
- 只推演当前一回合
- 不推进到下一回合
- 玩家本回合指令高优先级
- 如无法完整执行玩家指令，应保留核心意图并说明原因

## 8. 快速整场返回结构

```json
{
  "result_type": "full_battle",
  "battle_state": "finished",
  "rounds": [
    {
      "round_index": 1,
      "summary": "",
      "narration": ""
    }
  ],
  "final_selected_data_updates": {},
  "battle_report": "",
  "battle_end_reason": "",
  "settlement": {
    "mode": "direct_loot",
    "mvu_commit_ready": true,
    "loot_ready": true,
    "loot_context": {},
    "check_prompt_needed": false
  },
  "warnings": []
}
```

字段说明：
- `rounds`: 整场战斗主要推进过程
- `final_selected_data_updates`: 战斗结束后最终需要写回的字段变化
- `battle_report`: 整场战斗简报
- `settlement`: 结算模式与是否已可直接写回

设计原则：
- 一次性推演到结束
- 不支持中途抽某一回合返工
- 如果结果不满意，只支持整场重跑
- 玩家整体战斗倾向高优先级

## 9. 结算模式

系统统一支持三种结算模式：

### 9.1 `no_loot`

适用于：
- 切磋
- 擂台
- 比赛
- 训练
- 模拟战

行为：
- 战斗结束后直接允许写回 MVU
- 不生成战利品

### 9.2 `direct_loot`

适用于：
- 普通掉落战
- 常规野外遭遇战

行为：
- 战斗结束时直接返回战利品和最终写回结果

### 9.3 `checked_loot`

适用于：
- 需要搜刮
- 需要鉴定
- 需要拆解
- 需要额外属性检定才能决定掉落

行为：
- 战斗结束先完成战斗部分
- 再由玩家触发战利品检定 / 结算

## 10. 战利品结算协议

### 10.1 输入思路

通用输入内容：
- 战利品规则
- 可选检定规则
- 战斗结果摘要
- 敌方信息
- 环境上下文
- 可选额外检定结果
- 玩家补充说明

详细特殊背景可由玩家自行从角色卡或其他资料中复制补充。

### 10.2 返回结构

```json
{
  "loot_result": {
    "has_loot": true,
    "loot_items": [
      {
        "name": "",
        "quantity": 1,
        "description": "",
        "reason": ""
      }
    ],
    "special_findings": [
      {
        "name": "",
        "description": "",
        "reason": ""
      }
    ]
  },
  "mvu_updates": {},
  "loot_context": {},
  "warnings": []
}
```

字段说明：
- `loot_items`: 可直接获得的物品
- `special_findings`: 需要后处理的特殊发现、可拆解对象、线索等
- `mvu_updates`: 与战利品直接相关的 MVU 更新
- `loot_context`: 补充展示或记录上下文

### 10.3 设计原则

- 这一步只处理战利品，不再继续推演战斗
- 切磋、训练、模拟等应返回无战利品
- 如果没有额外检定结果，则按规则保守结算
- 额外检定成功只能在规则允许范围内提升掉落

## 11. MVU 更新字段规范

### 11.1 适用范围

统一适用于：
- `selected_data_updates`
- `final_selected_data_updates`
- `mvu_updates`

### 11.2 统一格式

```json
{
  "stat_data.xxx": "新值"
}
```

更准确地说：
- key: 完整路径
- value: 该路径更新后的目标值

### 11.3 规则

1. key 必须是完整路径
2. 路径必须以 `stat_data.` 开头
3. value 是更新后的目标值，而不是增量命令
4. AI 不返回 `op/add/remove/replace`
5. AI 不直接操作 MVU
6. 前端负责把这些值按路径写回当前 `stat_data`

### 11.4 推荐粒度

- 只改一个数值时，更新最小必要粒度
- 某个对象整体变化明显时，允许整块替换
- 清空对象时优先用空对象 `{}` 表达

示例：

```json
{
  "stat_data.主角.当前化身.HP": 82,
  "stat_data.主角.当前化身.MP": 31,
  "stat_data.敌方": {},
  "stat_data.背包.狼牙": {
    "名称": "狼牙",
    "数量": 2
  }
}
```

### 11.5 前端责任

前端负责：
1. 读取当前完整 `stat_data`
2. 对每个更新项执行按路径赋值
3. 合并后得到新数据
4. 再统一写回 MVU

也就是说：
- AI 只返回“路径 -> 新值”
- 前端模块才是真正执行写回的一层

## 12. Prompt 体系

当前已草拟四类 prompt：

1. 字段分析 prompt
2. 单回合战斗 prompt
3. 快速整场战斗 prompt
4. 战利品检定 / 掉落 prompt

### 12.1 字段分析 prompt

目标：
- 根据战斗协议分析完整 `stat_data`
- 返回正式战斗需要读取的字段路径

### 12.2 单回合战斗 prompt

目标：
- 只推当前一回合
- 玩家本回合指令高优先级
- 返回本回合变化和是否结束

### 12.3 快速整场战斗 prompt

目标：
- 一次性推演到结束
- 玩家整体战斗倾向高优先级
- 返回每回合摘要、最终战报、最终更新和结算信息

### 12.4 战利品结算 prompt

目标：
- 根据战利品规则和检定结果结算掉落
- 返回掉落结果与相关 MVU 更新

## 13. 当前实现边界

当前方案明确不做的事：
- 不让 AI 直接操作 MVU
- 不让 AI 返回 JSON Patch 命令流
- 不在正式战斗阶段发送完整 `stat_data`
- 不强依赖 `schema.ts`

当前方案明确要做的事：
- 配置期全量分析
- 运行期精简发送
- 玩家可修正字段选择
- 统一路径更新协议
- 统一结算模式

## 14. 后续实现建议

推荐下一步实现顺序：

1. 写设计对应的配置数据结构
2. 写字段分析调用与字段勾选页
3. 写完整 `stat_data` 路径树浏览
4. 写 `selected_data` 抽取逻辑
5. 写单回合战斗请求与结果渲染
6. 写快速整场战斗请求与结果渲染
7. 写 `checked_loot` 战利品流程
8. 写 MVU 更新合并与提交模块
