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

export type BattleContextConfig = {
  include_worldbook_context: boolean;
  include_environment_context: boolean;
  include_floor_context: boolean;
  include_recent_battle_report: boolean;
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
  warnings: string[];
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
    last_analysis_at: null,
    manual_review_required: false,
  };
}

export function createDefaultBattlePromptTemplate(title: string): BattlePromptTemplate {
  return {
    enabled: true,
    version: 1,
    title,
    system_prompt: '',
    user_prompt: '',
    output_contract_prompt: '',
    notes: '',
  };
}

export function createDefaultBattlePromptConfig(): BattlePromptConfig {
  return {
    field_analysis: createDefaultBattlePromptTemplate('字段分析'),
    single_round: createDefaultBattlePromptTemplate('单回合战斗'),
    full_battle: createDefaultBattlePromptTemplate('快速整场战斗'),
    loot_resolution: createDefaultBattlePromptTemplate('战利品结算'),
  };
}

export function createDefaultBattleContextConfig(): BattleContextConfig {
  return {
    include_worldbook_context: true,
    include_environment_context: true,
    include_floor_context: true,
    include_recent_battle_report: false,
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
