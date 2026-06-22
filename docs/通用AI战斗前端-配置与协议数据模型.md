# 通用 AI 战斗前端配置与协议数据模型

本文档把“设置数据结构”和“单次协议结构”拆开定义，作为后续实现 BattleProfile、设置页、请求层、MVU 写回层的直接依据。

适用范围：
- 宿主为 Tavern Helper + MVU
- 主要运行数据来自消息楼层 `stat_data`
- 仍保留当前项目已有 `battle_session` 事务边界

不在本文档解决的事：
- 具体 Vue 组件拆分
- 现有 `battle_session` 状态机是否重构
- prompt 文案最终定稿

## 1. 设计原则

### 1.1 把“长期配置”和“单次运行数据”分开

不能把这些东西混成一个对象：
- API 配置
- 战斗协议
- prompt 模板
- 字段勾选结果
- 本回合请求输入
- AI 本次返回结果

建议拆成两层：
- `BattleFrontendSettings`: 前端长期持久化设置
- `BattleRuntimePayload / BattleRuntimeResult`: 单次运行协议

### 1.2 把“API 配置”和“战斗配置”分开

原因：
- 一个 API 配置可能被多个战斗配置复用
- 用户可能只改模型，不想复制整套战斗规则
- 后续如果支持导入导出，分开更容易合并

### 1.3 把“字段分析结果”和“正式运行字段”分开

原因：
- AI 自动分析只是建议，不是真正最终配置
- 玩家需要手动补选、禁用、备注
- 后续可保留“上次分析警告”和“当前启用字段”两套信息

## 2. 顶层设置结构

建议的顶层结构：

```ts
type BattleFrontendSettings = {
  version: 1;
  active_api_profile_id: string | null;
  active_battle_profile_id: string | null;
  api_profiles: BattleApiProfile[];
  battle_profiles: BattleProfile[];
  ui_preferences: BattleUiPreferences;
};
```

说明：
- `version`: 用于以后迁移设置结构
- `active_api_profile_id`: 当前默认接口
- `active_battle_profile_id`: 当前默认战斗配置
- `api_profiles`: API / Key / 模型配置集合
- `battle_profiles`: 战斗规则配置集合
- `ui_preferences`: 不影响战斗逻辑的界面偏好

## 3. API 配置结构

建议结构：

```ts
type BattleApiProfile = {
  id: string;
  name: string;
  enabled: boolean;
  provider_type: 'openai_compatible' | 'custom';
  base_url: string;
  api_key: string;
  model: string;
  model_fetch_path: string;
  headers: Record<string, string>;
  default_request_options: BattleRequestOptions;
  model_discovery: BattleModelDiscoveryConfig;
  last_test_result: BattleApiTestResult | null;
  created_at: number;
  updated_at: number;
};
```

字段要点：
- `provider_type`: 第一版不需要列很多厂商枚举，保持 `openai_compatible` 和 `custom` 两档即可
- `model_fetch_path`: 默认可用 `/v1/models`
- `headers`: 预留给特殊服务商
- `default_request_options`: 温度、token、超时等默认值
- `last_test_result`: 只用于设置页展示，不参与正式推演

### 3.1 请求参数结构

```ts
type BattleRequestOptions = {
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
  timeout_ms: number;
  enable_stream: boolean;
  enable_reasoning_content: boolean;
  retry_limit: number;
};
```

建议：
- 第一版战斗返回以结构化 JSON 为主，默认 `enable_stream = false`
- `enable_reasoning_content` 只影响调试展示，不参与 JSON 解析

### 3.2 模型发现结构

```ts
type BattleModelDiscoveryConfig = {
  enabled: boolean;
  use_auth_header: boolean;
  response_path: string;
};
```

说明：
- `response_path` 默认可写成 `data`
- 这样即使个别服务商结构不同，后续也能做兼容

## 4. 战斗配置结构

建议结构：

```ts
type BattleProfile = {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  api_profile_id: string | null;
  run_mode: BattleRunMode;
  default_turn_mode: BattleTurnMode;
  settlement_mode: BattleSettlementMode;
  rules: BattleRulesConfig;
  field_selection: BattleFieldSelectionConfig;
  prompts: BattlePromptConfig;
  context: BattleContextConfig;
  output: BattleOutputConfig;
  debug: BattleDebugConfig;
  created_at: number;
  updated_at: number;
};
```

`BattleProfile` 是这套系统真正的核心配置对象。

它应描述：
- 用哪个 API
- 按什么战斗协议跑
- 抽哪些 `stat_data` 字段
- 用哪些 prompt 模板
- 用哪些上下文增强
- 希望 AI 返回怎样的结果风格

## 5. 战斗规则配置

```ts
type BattleRulesConfig = {
  battle_protocol: string;
  loot_protocol: string;
  extra_world_rules: string;
  player_intent_priority: 'high';
  allow_full_stat_data_in_analysis: boolean;
  forbid_full_stat_data_in_runtime: boolean;
  schema_hint_enabled: boolean;
};
```

建议默认值：
- `player_intent_priority = 'high'`
- `allow_full_stat_data_in_analysis = true`
- `forbid_full_stat_data_in_runtime = true`
- `schema_hint_enabled = false`

这里把已经敲定的设计边界直接固化进配置层，避免后续实现时走偏。

## 6. 字段勾选配置

建议结构：

```ts
type BattleFieldSelectionConfig = {
  selected_fields: BattleSelectedField[];
  analysis_warnings: string[];
  last_analysis_input_hash: string;
  last_analysis_at: number | null;
  manual_review_required: boolean;
};
```

```ts
type BattleSelectedField = {
  path: string;
  label: string;
  enabled: boolean;
  source: 'ai' | 'manual';
  reason: string;
  value_kind: 'unknown' | 'scalar' | 'object' | 'array';
};
```

说明：
- `selected_fields` 是正式运行真正使用的字段列表
- `analysis_warnings` 保留 AI 提示
- `last_analysis_input_hash` 用于判断协议或 `stat_data` 是否已发生较大变化
- `manual_review_required` 用来提醒玩家“AI 自动勾选后还没人工确认”

### 6.1 路径树浏览不是这个结构的一部分

完整 `stat_data` 路径树属于运行时派生数据，不建议直接存入配置。

原因：
- 体积太大
- 容易和当前消息楼层数据脱节
- 前端每次打开设置页时都可以重新从当前 `stat_data` 派生

## 7. Prompt 配置结构

建议结构：

```ts
type BattlePromptConfig = {
  field_analysis: BattlePromptTemplate;
  single_round: BattlePromptTemplate;
  full_battle: BattlePromptTemplate;
  loot_resolution: BattlePromptTemplate;
};
```

```ts
type BattlePromptTemplate = {
  enabled: boolean;
  version: number;
  title: string;
  system_prompt: string;
  user_prompt: string;
  output_contract_prompt: string;
  notes: string;
};
```

设计理由：
- `system_prompt`: 放不可轻易违背的裁定规则
- `user_prompt`: 放任务说明和输入区块模板
- `output_contract_prompt`: 专门放输出 JSON 结构要求
- `notes`: 给设置页自己看，不参与发送

### 7.1 为什么单独拆 `output_contract_prompt`

因为这部分未来最容易被频繁调试：
- 改字段名
- 改返回约束
- 改“必须只返回 JSON”

把它混在 `system_prompt` 里，后续维护会很痛苦。

## 8. 上下文配置结构

建议结构：

```ts
type BattleContextConfig = {
  include_worldbook_context: boolean;
  include_environment_context: boolean;
  include_floor_context: boolean;
  include_recent_battle_report: boolean;
  extra_context_text: string;
};
```

说明：
- 这些都是可选增强
- 不能把它们做成必须存在

## 9. 输出配置结构

建议结构：

```ts
type BattleOutputConfig = {
  round_narration_style: 'minimal' | 'balanced' | 'detailed';
  full_battle_report_target_words: number;
  append_report_to_tavern_input: boolean;
  show_raw_json_preview: boolean;
};
```

说明：
- 用户前面倾向“中性、分块”
- 所以后续默认值可以偏向：
  - `round_narration_style = 'balanced'`
  - `full_battle_report_target_words = 500`

## 10. 调试配置结构

建议结构：

```ts
type BattleDebugConfig = {
  save_last_analysis_payload: boolean;
  save_last_runtime_payload: boolean;
  save_last_ai_raw_text: boolean;
  allow_retry_on_invalid_json: boolean;
};
```

说明：
- 这组配置只影响调试体验
- 不应改变战斗规则本身

## 11. 运行期协议结构

这一层不属于长期设置，但要提前定型。

### 11.1 字段分析请求

```ts
type BattleFieldAnalysisPayload = {
  task: 'analyze_battle_fields';
  run_mode: BattleRunMode;
  battle_protocol: string;
  stat_data: Record<string, unknown>;
  worldbook_context: string[];
  extra_instructions: string;
};
```

### 11.2 字段分析返回

```ts
type BattleFieldAnalysisResult = {
  fields: BattleFieldSuggestion[];
  warnings: string[];
};
```

```ts
type BattleFieldSuggestion = {
  path: string;
  label: string;
  reason: string;
};
```

### 11.3 正式战斗请求

```ts
type BattleRuntimePayload = {
  task: 'run_battle';
  run_mode: BattleRunMode;
  turn_mode: BattleTurnMode;
  battle_protocol: string;
  selected_data: Record<string, unknown>;
  player_command: string;
  dice_inputs: Record<string, unknown>;
  worldbook_context: string[];
  environment_context: Record<string, unknown>;
  extra_instructions: string;
};
```

### 11.4 单回合返回

```ts
type BattleRoundResult = {
  result_type: 'round';
  battle_state: 'ongoing' | 'finished';
  round_index: number;
  summary: string;
  narration: string;
  selected_data_updates: BattleFlatUpdates;
  status_changes: string[];
  resource_changes: string[];
  battle_end: boolean;
  battle_end_reason: string;
  settlement: BattleSettlementDecision;
  warnings: string[];
};
```

### 11.5 快速整场返回

```ts
type BattleFullResult = {
  result_type: 'full_battle';
  battle_state: 'finished';
  rounds: BattleRoundDigest[];
  final_selected_data_updates: BattleFlatUpdates;
  battle_report: string;
  battle_end_reason: string;
  settlement: BattleSettlementDecision;
  warnings: string[];
};
```

### 11.6 战利品返回

```ts
type BattleLootResult = {
  loot_result: {
    has_loot: boolean;
    loot_items: BattleLootItem[];
    special_findings: BattleSpecialFinding[];
  };
  mvu_updates: BattleFlatUpdates;
  loot_context: Record<string, unknown>;
  warnings: string[];
};
```

## 12. 扁平更新结构

统一结构：

```ts
type BattleFlatUpdates = Record<string, unknown>;
```

但运行时应强约束：
- key 必须以 `stat_data.` 开头
- value 是目标值，不是增量命令

建议后续实现额外加一层工具函数：

```ts
function isValidBattleUpdatePath(path: string): boolean
```

用于：
- AI 返回校验
- 前端写回前过滤

## 13. 推荐默认值策略

第一版建议默认配置：

```ts
{
  run_mode: 'dice_driven',
  default_turn_mode: 'round_based',
  settlement_mode: 'checked_loot',
  player_intent_priority: 'high',
  allow_full_stat_data_in_analysis: true,
  forbid_full_stat_data_in_runtime: true,
  include_worldbook_context: true,
  include_environment_context: true,
  include_floor_context: true,
  include_recent_battle_report: false,
  round_narration_style: 'balanced',
  full_battle_report_target_words: 500,
  append_report_to_tavern_input: true,
  show_raw_json_preview: true,
  allow_retry_on_invalid_json: true
}
```

注意：
- `settlement_mode` 默认值是否设成 `checked_loot`，后续可再讨论
- 这里只是为了让类型层有一个稳定起点

## 14. 后续实现建议

按这个数据模型，后续落代码建议顺序为：

1. 先实现 `BattleFrontendSettings` 的存取层
2. 再实现 `BattleProfile` 编辑页
3. 再实现字段分析请求和自动勾选
4. 再实现完整路径树浏览和手动补选
5. 再实现 `selected_data` 抽取器
6. 再实现运行期请求 / 返回解析
7. 最后接 MVU 写回与现有 `battle_session` 提交边界

## 15. 和当前代码的对接关系

当前建议的边界是：

- 本文定义的数据模型：
  - 新设置页和 AI 协议层使用

- 当前 `battle_session`：
  - 仍负责本项目现有逐回合战斗事务态

- 后续真正实现时应增加一层适配：
  - `BattleProfile` -> prompt / request payload
  - AI result -> flat updates
  - flat updates -> 统一提交层 / MVU 写回层

不要直接把 `BattleProfile` 塞进现在的 `battle_session` 字段里。

它们职责不同：
- `BattleProfile` 是配置
- `battle_session` 是临时运行态
