export type BattleRunMode = 'dice_driven' | 'freeform';

export type BattleTurnMode = 'round_based' | 'full_battle';

export type BattleSettlementMode = 'no_loot' | 'direct_loot' | 'checked_loot';

export type BattleProviderType = 'openai_compatible' | 'custom';

export type BattleFieldSource = 'ai' | 'manual';

export type BattleFieldValueKind = 'unknown' | 'scalar' | 'object' | 'array';

export type BattleNarrationStyle = 'minimal' | 'balanced' | 'detailed';

export type BattleState = 'ongoing' | 'finished';

export type BattleRequestOptions = {
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
  timeout_ms: number;
  enable_stream: boolean;
  enable_reasoning_content: boolean;
  retry_limit: number;
};

export type BattleModelDiscoveryConfig = {
  enabled: boolean;
  use_auth_header: boolean;
  response_path: string;
};

export type BattleApiTestResult = {
  ok: boolean;
  checked_at: number;
  message: string;
  model_count: number | null;
};

export type BattleApiProfile = {
  id: string;
  name: string;
  enabled: boolean;
  provider_type: BattleProviderType;
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

export type BattleRulesConfig = {
  battle_protocol: string;
  loot_protocol: string;
  extra_world_rules: string;
  player_intent_priority: 'high';
  allow_full_stat_data_in_analysis: boolean;
  forbid_full_stat_data_in_runtime: boolean;
  schema_hint_enabled: boolean;
};

export type BattleSelectedField = {
  path: string;
  label: string;
  enabled: boolean;
  source: BattleFieldSource;
  reason: string;
  value_kind: BattleFieldValueKind;
};

export type BattleFieldSelectionConfig = {
  selected_fields: BattleSelectedField[];
  analysis_warnings: string[];
  last_analysis_input_hash: string;
  source_data_hash: string;
  last_analysis_at: number | null;
  manual_review_required: boolean;
};

export type BattlePromptTemplate = {
  enabled: boolean;
  version: number;
  title: string;
  system_prompt: string;
  user_prompt: string;
  output_contract_prompt: string;
  notes: string;
};

export type BattlePromptConfig = {
  field_analysis: BattlePromptTemplate;
  single_round: BattlePromptTemplate;
  full_battle: BattlePromptTemplate;
  loot_resolution: BattlePromptTemplate;
};

export type BattleWorldbookSource = 'character' | 'global' | 'manual';

export type BattleImportedWorldbook = {
  id: string;
  name: string;
  source: BattleWorldbookSource;
  enabled: boolean;
  content: string;
  entry_count: number;
  imported_at: number;
};

export type BattleContextConfig = {
  include_worldbook_context: boolean;
  include_environment_context: boolean;
  include_floor_context: boolean;
  include_recent_battle_report: boolean;
  worldbook_max_chars: number;
  imported_worldbooks: BattleImportedWorldbook[];
  extra_context_text: string;
};

export type BattleOutputConfig = {
  round_narration_style: BattleNarrationStyle;
  full_battle_report_target_words: number;
  append_report_to_tavern_input: boolean;
  show_raw_json_preview: boolean;
};

export type BattleDebugConfig = {
  save_last_analysis_payload: boolean;
  save_last_runtime_payload: boolean;
  save_last_ai_raw_text: boolean;
  allow_retry_on_invalid_json: boolean;
};

export type BattleProfile = {
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

export type BattleUiPreferences = {
  selected_data_tree_expanded_paths: string[];
  field_browser_expanded_paths: string[];
  active_settings_tab: string;
};

export const BATTLE_FRONTEND_SETTINGS_VERSION = 1 as const;

export type BattleFrontendSettings = {
  version: typeof BATTLE_FRONTEND_SETTINGS_VERSION;
  active_api_profile_id: string | null;
  active_battle_profile_id: string | null;
  api_profiles: BattleApiProfile[];
  battle_profiles: BattleProfile[];
  ui_preferences: BattleUiPreferences;
};

export type BattleFieldAnalysisPayload = {
  task: 'analyze_battle_fields';
  run_mode: BattleRunMode;
  battle_protocol: string;
  stat_data: Record<string, unknown>;
  worldbook_context: string[];
  extra_instructions: string;
};

export type BattleFieldSuggestion = {
  path: string;
  label: string;
  reason: string;
};

export type BattleFieldAnalysisResult = {
  fields: BattleFieldSuggestion[];
  warnings: string[];
};

export type BattleRuntimePayload = {
  task: 'run_battle';
  run_mode: BattleRunMode;
  turn_mode: BattleTurnMode;
  battle_protocol: string;
  loot_protocol?: string;
  settlement_mode?: BattleSettlementMode;
  selected_data: Record<string, unknown>;
  player_command: string;
  dice_inputs: Record<string, unknown>;
  worldbook_context: string[];
  environment_context: Record<string, unknown>;
  extra_instructions: string;
};

export type BattleFlatUpdates = Record<string, unknown>;

export type BattleSettlementDecision = {
  mode: BattleSettlementMode;
  mvu_commit_ready: boolean;
  loot_ready: boolean;
  loot_context: Record<string, unknown>;
  check_prompt_needed: boolean;
};

export type BattleRoundDigest = {
  round_index: number;
  summary: string;
  narration: string;
};

export type BattleLootItem = {
  name: string;
  quantity: number;
  description: string;
  reason: string;
};

export type BattleSpecialFinding = {
  name: string;
  description: string;
  reason: string;
};

export type BattleRoundResult = {
  result_type: 'round';
  battle_state: BattleState;
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

export type BattleFullResult = {
  result_type: 'full_battle';
  battle_state: 'finished';
  rounds: BattleRoundDigest[];
  final_selected_data_updates: BattleFlatUpdates;
  battle_report: string;
  battle_end_reason: string;
  settlement: BattleSettlementDecision;
  loot_result: {
    has_loot: boolean;
    loot_items: BattleLootItem[];
    special_findings: BattleSpecialFinding[];
  };
  loot_mvu_updates: BattleFlatUpdates;
  loot_context: Record<string, unknown>;
  warnings: string[];
};

export type BattleLootResult = {
  loot_result: {
    has_loot: boolean;
    loot_items: BattleLootItem[];
    special_findings: BattleSpecialFinding[];
  };
  mvu_updates: BattleFlatUpdates;
  loot_context: Record<string, unknown>;
  warnings: string[];
};

export function createDefaultBattleRequestOptions(): BattleRequestOptions {
  return {
    temperature: 0.2,
    top_p: 1,
    max_tokens: 4000,
    timeout_ms: 90000,
    enable_stream: false,
    enable_reasoning_content: false,
    retry_limit: 2,
  };
}

export function createDefaultBattleModelDiscoveryConfig(): BattleModelDiscoveryConfig {
  return {
    enabled: true,
    use_auth_header: true,
    response_path: 'data',
  };
}

export function createDefaultBattleUiPreferences(): BattleUiPreferences {
  return {
    selected_data_tree_expanded_paths: [],
    field_browser_expanded_paths: [],
    active_settings_tab: 'profiles',
  };
}

export function createBattleFrontendEntityId(prefix: 'api' | 'battle'): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function createDefaultBattleApiTestResult(): BattleApiTestResult {
  return {
    ok: false,
    checked_at: 0,
    message: '',
    model_count: null,
  };
}

export function createDefaultBattleRulesConfig(): BattleRulesConfig {
  return {
    battle_protocol: '',
    loot_protocol: '',
    extra_world_rules: '',
    player_intent_priority: 'high',
    allow_full_stat_data_in_analysis: true,
    forbid_full_stat_data_in_runtime: true,
    schema_hint_enabled: false,
  };
}

export function createDefaultBattleFieldSelectionConfig(): BattleFieldSelectionConfig {
  return {
    selected_fields: [],
    analysis_warnings: [],
    last_analysis_input_hash: '',
    source_data_hash: '',
    last_analysis_at: null,
    manual_review_required: false,
  };
}

function buildDefaultFieldAnalysisSystemPrompt(): string {
  return [
    '你是通用战斗字段分析器。',
    '你的任务是根据战斗协议和当前 stat_data，挑出正式战斗请求必须观察或可能回写的字段路径。',
    '必须遵守：',
    '1. 只关注战斗判定、资源变化、状态变化、战利品结算直接相关的字段。',
    '2. 优先最小必要字段集，不要把无关设定、纯背景文本或 battle_session 带进去。',
    '3. path 使用 stat_data 内部路径，不要带最外层 stat_data. 前缀。',
    '4. 不得根据固定项目名称、固定角色名或固定字段模板补造字段。',
    '5. 若某些关键字段名称不明确，可在 warnings 里提醒玩家人工补查。',
    '6. 只能返回 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildDefaultFieldAnalysisUserPrompt(): string {
  return [
    '请分析下面的战斗字段请求，返回推荐字段列表。',
    '若你判断某条战斗协议需要观察 HP、MP、护盾、状态、背包、敌方单位等信息，请明确列出当前 stat_data 中真实存在的路径。',
    '若不同 run_mode 对字段依赖不同，也请按当前 run_mode 保守裁定。',
  ].join('\n');
}

function buildDefaultFieldAnalysisOutputPrompt(): string {
  return [
    '返回 JSON 结构：',
    '{',
    '  "fields": [{ "path": "角色.生命值.当前值", "label": "当前生命值", "reason": "..." }],',
    '  "warnings": ["..."]',
    '}',
    '要求：fields 和 warnings 必须始终存在。',
  ].join('\n');
}

function buildDefaultSingleRoundSystemPrompt(): string {
  return [
    '你是战斗单回合裁定器。',
    '根据 selected_data、战斗协议和玩家指令，只处理当前回合。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildDefaultSingleRoundUserPrompt(): string {
  return '请根据战斗输入返回当前回合的摘要、叙述、selected_data_updates、状态变化和结算信息。';
}

function buildDefaultSingleRoundOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'result_type, battle_state, round_index, summary, narration, selected_data_updates, status_changes, resource_changes, battle_end, battle_end_reason, settlement, warnings。',
    'result_type 固定为 round。',
  ].join('\n');
}

function buildDefaultFullBattleSystemPrompt(): string {
  return [
    '你是快速整场战斗推演器。',
    '根据 selected_data、战斗协议、掉落协议和玩家总体战斗倾向，一次性推演到战斗结束并完成战利品结算。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildDefaultFullBattleUserPrompt(): string {
  return '请输出整场战斗每回合摘要、最终战报、最终 selected_data_updates、结算信息和战利品结果。';
}

function buildDefaultFullBattleOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'result_type, battle_state, rounds, final_selected_data_updates, battle_report, battle_end_reason, settlement, loot_result, loot_mvu_updates, loot_context, warnings。',
    'result_type 固定为 full_battle。',
    '快速整场模式必须根据 runtime_payload.loot_protocol 在同一次响应中完成战利品结算；若 settlement_mode 为 no_loot，则 loot_result.has_loot=false 且 loot_items 为空。',
  ].join('\n');
}

function buildDefaultLootSystemPrompt(): string {
  return [
    '你是战利品结算器。',
    '根据当前 selected_data、掉落协议和战斗结束上下文，返回战利品与 MVU 更新草案。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildDefaultLootUserPrompt(): string {
  return '请根据结算模式和掉落协议，返回战利品结果、附加发现和 mvu_updates。';
}

function buildDefaultLootOutputPrompt(): string {
  return ['返回 JSON 字段：', 'loot_result, mvu_updates, loot_context, warnings。'].join('\n');
}

export function createDefaultBattlePromptTemplate(
  title: string,
  defaults: Partial<Pick<BattlePromptTemplate, 'system_prompt' | 'user_prompt' | 'output_contract_prompt'>> = {},
): BattlePromptTemplate {
  return {
    enabled: true,
    version: 1,
    title,
    system_prompt: defaults.system_prompt ?? '',
    user_prompt: defaults.user_prompt ?? '',
    output_contract_prompt: defaults.output_contract_prompt ?? '',
    notes: '',
  };
}

export function createDefaultBattlePromptConfig(): BattlePromptConfig {
  return {
    field_analysis: createDefaultBattlePromptTemplate('字段分析', {
      system_prompt: buildDefaultFieldAnalysisSystemPrompt(),
      user_prompt: buildDefaultFieldAnalysisUserPrompt(),
      output_contract_prompt: buildDefaultFieldAnalysisOutputPrompt(),
    }),
    single_round: createDefaultBattlePromptTemplate('单回合战斗', {
      system_prompt: buildDefaultSingleRoundSystemPrompt(),
      user_prompt: buildDefaultSingleRoundUserPrompt(),
      output_contract_prompt: buildDefaultSingleRoundOutputPrompt(),
    }),
    full_battle: createDefaultBattlePromptTemplate('快速整场战斗', {
      system_prompt: buildDefaultFullBattleSystemPrompt(),
      user_prompt: buildDefaultFullBattleUserPrompt(),
      output_contract_prompt: buildDefaultFullBattleOutputPrompt(),
    }),
    loot_resolution: createDefaultBattlePromptTemplate('战利品结算', {
      system_prompt: buildDefaultLootSystemPrompt(),
      user_prompt: buildDefaultLootUserPrompt(),
      output_contract_prompt: buildDefaultLootOutputPrompt(),
    }),
  };
}

export function createDefaultBattleContextConfig(): BattleContextConfig {
  return {
    include_worldbook_context: true,
    include_environment_context: true,
    include_floor_context: true,
    include_recent_battle_report: false,
    worldbook_max_chars: 3000,
    imported_worldbooks: [],
    extra_context_text: '',
  };
}

export function createDefaultBattleOutputConfig(): BattleOutputConfig {
  return {
    round_narration_style: 'balanced',
    full_battle_report_target_words: 500,
    append_report_to_tavern_input: true,
    show_raw_json_preview: true,
  };
}

export function createDefaultBattleDebugConfig(): BattleDebugConfig {
  return {
    save_last_analysis_payload: false,
    save_last_runtime_payload: false,
    save_last_ai_raw_text: false,
    allow_retry_on_invalid_json: true,
  };
}

export function createDefaultBattleApiProfile(now = Date.now()): BattleApiProfile {
  return {
    id: createBattleFrontendEntityId('api'),
    name: '默认接口',
    enabled: true,
    provider_type: 'openai_compatible',
    base_url: '',
    api_key: '',
    model: '',
    model_fetch_path: '/v1/models',
    headers: {},
    default_request_options: createDefaultBattleRequestOptions(),
    model_discovery: createDefaultBattleModelDiscoveryConfig(),
    last_test_result: null,
    created_at: now,
    updated_at: now,
  };
}

export function createDefaultBattleProfile(apiProfileId: string | null = null, now = Date.now()): BattleProfile {
  return {
    id: createBattleFrontendEntityId('battle'),
    name: '默认战斗配置',
    enabled: true,
    description: '',
    api_profile_id: apiProfileId,
    run_mode: 'dice_driven',
    default_turn_mode: 'round_based',
    settlement_mode: 'checked_loot',
    rules: createDefaultBattleRulesConfig(),
    field_selection: createDefaultBattleFieldSelectionConfig(),
    prompts: createDefaultBattlePromptConfig(),
    context: createDefaultBattleContextConfig(),
    output: createDefaultBattleOutputConfig(),
    debug: createDefaultBattleDebugConfig(),
    created_at: now,
    updated_at: now,
  };
}

export function createDefaultBattleFrontendSettings(): BattleFrontendSettings {
  const apiProfile = createDefaultBattleApiProfile();
  const battleProfile = createDefaultBattleProfile(apiProfile.id);
  return {
    version: BATTLE_FRONTEND_SETTINGS_VERSION,
    active_api_profile_id: apiProfile.id,
    active_battle_profile_id: battleProfile.id,
    api_profiles: [apiProfile],
    battle_profiles: [battleProfile],
    ui_preferences: createDefaultBattleUiPreferences(),
  };
}
