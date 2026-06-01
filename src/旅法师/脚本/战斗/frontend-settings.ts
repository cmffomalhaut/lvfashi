import { klona } from 'klona';
import {
  BATTLE_FRONTEND_SETTINGS_VERSION,
  createBattleFrontendEntityId,
  createDefaultBattleApiProfile,
  createDefaultBattleContextConfig,
  createDefaultBattleDebugConfig,
  createDefaultBattleFieldSelectionConfig,
  createDefaultBattleFrontendSettings,
  createDefaultBattleModelDiscoveryConfig,
  createDefaultBattleOutputConfig,
  createDefaultBattleProfile,
  createDefaultBattlePromptConfig,
  createDefaultBattlePromptTemplate,
  createDefaultBattleRequestOptions,
  createDefaultBattleRulesConfig,
  createDefaultBattleUiPreferences,
  type BattleApiProfile,
  type BattleFieldSelectionConfig,
  type BattleFrontendSettings,
  type BattleProfile,
  type BattleUiPreferences,
} from './ai-profile.ts';

const BATTLE_FRONTEND_SETTINGS_STORAGE_KEY = 'battle_frontend_settings';
const LEGACY_ROOT_KEYS = [
  'version',
  'active_api_profile_id',
  'active_battle_profile_id',
  'api_profiles',
  'battle_profiles',
  'ui_preferences',
] as const;

export const BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION = Object.freeze({ type: 'script' } as const);

const trimmedString = (fallback = '') => z.string().transform(value => value.trim()).prefault(fallback);
const stringArray = () => z.array(z.string()).prefault([]);
const finiteInteger = (fallback = 0) =>
  z.coerce.number().transform(value => {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.trunc(value);
  });
const nonNegativeInteger = (fallback = 0) =>
  finiteInteger(fallback).transform(value => {
    if (value < 0) {
      return fallback;
    }
    return value;
  });
const nullableFiniteNumber = (fallback: number | null = null) =>
  z.union([z.null(), z.coerce.number()]).transform(value => {
    if (value === null) {
      return null;
    }
    return Number.isFinite(value) ? value : fallback;
  });

export const BattleRequestOptionsSchema = z.object({
  temperature: nullableFiniteNumber(createDefaultBattleRequestOptions().temperature).prefault(
    createDefaultBattleRequestOptions().temperature,
  ),
  top_p: nullableFiniteNumber(createDefaultBattleRequestOptions().top_p).prefault(createDefaultBattleRequestOptions().top_p),
  max_tokens: nullableFiniteNumber(createDefaultBattleRequestOptions().max_tokens).prefault(
    createDefaultBattleRequestOptions().max_tokens,
  ),
  timeout_ms: nonNegativeInteger(createDefaultBattleRequestOptions().timeout_ms).prefault(
    createDefaultBattleRequestOptions().timeout_ms,
  ),
  enable_stream: z.boolean().prefault(createDefaultBattleRequestOptions().enable_stream),
  enable_reasoning_content: z.boolean().prefault(createDefaultBattleRequestOptions().enable_reasoning_content),
  retry_limit: nonNegativeInteger(createDefaultBattleRequestOptions().retry_limit).prefault(
    createDefaultBattleRequestOptions().retry_limit,
  ),
});

export const BattleModelDiscoveryConfigSchema = z.object({
  enabled: z.boolean().prefault(createDefaultBattleModelDiscoveryConfig().enabled),
  use_auth_header: z.boolean().prefault(createDefaultBattleModelDiscoveryConfig().use_auth_header),
  response_path: trimmedString(createDefaultBattleModelDiscoveryConfig().response_path).prefault(
    createDefaultBattleModelDiscoveryConfig().response_path,
  ),
});

export const BattleApiTestResultSchema = z.object({
  ok: z.boolean().prefault(false),
  checked_at: nonNegativeInteger().prefault(0),
  message: trimmedString().prefault(''),
  model_count: nullableFiniteNumber().prefault(null),
});

export const BattleApiProfileSchema = z.object({
  id: trimmedString().prefault(''),
  name: trimmedString().prefault(''),
  enabled: z.boolean().prefault(true),
  provider_type: z.enum(['openai_compatible', 'custom']).prefault('openai_compatible'),
  base_url: trimmedString().prefault(''),
  api_key: trimmedString().prefault(''),
  model: trimmedString().prefault(''),
  model_fetch_path: trimmedString('/v1/models').prefault('/v1/models'),
  headers: z.record(z.string(), z.string()).prefault({}),
  default_request_options: BattleRequestOptionsSchema.prefault(createDefaultBattleRequestOptions()),
  model_discovery: BattleModelDiscoveryConfigSchema.prefault(createDefaultBattleModelDiscoveryConfig()),
  last_test_result: BattleApiTestResultSchema.nullable().prefault(null),
  created_at: nonNegativeInteger().prefault(0),
  updated_at: nonNegativeInteger().prefault(0),
});

export const BattleRulesConfigSchema = z.object({
  battle_protocol: trimmedString().prefault(createDefaultBattleRulesConfig().battle_protocol),
  loot_protocol: trimmedString().prefault(createDefaultBattleRulesConfig().loot_protocol),
  extra_world_rules: trimmedString().prefault(createDefaultBattleRulesConfig().extra_world_rules),
  player_intent_priority: z.literal('high').prefault(createDefaultBattleRulesConfig().player_intent_priority),
  allow_full_stat_data_in_analysis: z.boolean().prefault(createDefaultBattleRulesConfig().allow_full_stat_data_in_analysis),
  forbid_full_stat_data_in_runtime: z.boolean().prefault(createDefaultBattleRulesConfig().forbid_full_stat_data_in_runtime),
  schema_hint_enabled: z.boolean().prefault(createDefaultBattleRulesConfig().schema_hint_enabled),
});

export const BattleSelectedFieldSchema = z.object({
  path: trimmedString().prefault(''),
  label: trimmedString().prefault(''),
  enabled: z.boolean().prefault(true),
  source: z.enum(['ai', 'manual']).prefault('manual'),
  reason: trimmedString().prefault(''),
  value_kind: z.enum(['unknown', 'scalar', 'object', 'array']).prefault('unknown'),
});

export const BattleFieldSelectionConfigSchema = z.object({
  selected_fields: z.array(BattleSelectedFieldSchema).prefault([]),
  analysis_warnings: stringArray(),
  last_analysis_input_hash: trimmedString().prefault(createDefaultBattleFieldSelectionConfig().last_analysis_input_hash),
  last_analysis_at: nullableFiniteNumber().prefault(createDefaultBattleFieldSelectionConfig().last_analysis_at),
  manual_review_required: z.boolean().prefault(createDefaultBattleFieldSelectionConfig().manual_review_required),
});

export const BattlePromptTemplateSchema = z.object({
  enabled: z.boolean().prefault(true),
  version: nonNegativeInteger(1).prefault(1),
  title: trimmedString().prefault(''),
  system_prompt: z.string().prefault(''),
  user_prompt: z.string().prefault(''),
  output_contract_prompt: z.string().prefault(''),
  notes: z.string().prefault(''),
});

export const BattlePromptConfigSchema = z.object({
  field_analysis: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptTemplate('字段分析')),
  single_round: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptTemplate('单回合战斗')),
  full_battle: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptTemplate('快速整场战斗')),
  loot_resolution: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptTemplate('战利品结算')),
});

export const BattleContextConfigSchema = z.object({
  include_worldbook_context: z.boolean().prefault(createDefaultBattleContextConfig().include_worldbook_context),
  include_environment_context: z.boolean().prefault(createDefaultBattleContextConfig().include_environment_context),
  include_floor_context: z.boolean().prefault(createDefaultBattleContextConfig().include_floor_context),
  include_recent_battle_report: z.boolean().prefault(createDefaultBattleContextConfig().include_recent_battle_report),
  extra_context_text: z.string().prefault(createDefaultBattleContextConfig().extra_context_text),
});

export const BattleOutputConfigSchema = z.object({
  round_narration_style: z.enum(['minimal', 'balanced', 'detailed']).prefault(
    createDefaultBattleOutputConfig().round_narration_style,
  ),
  full_battle_report_target_words: nonNegativeInteger(createDefaultBattleOutputConfig().full_battle_report_target_words).prefault(
    createDefaultBattleOutputConfig().full_battle_report_target_words,
  ),
  append_report_to_tavern_input: z.boolean().prefault(createDefaultBattleOutputConfig().append_report_to_tavern_input),
  show_raw_json_preview: z.boolean().prefault(createDefaultBattleOutputConfig().show_raw_json_preview),
});

export const BattleDebugConfigSchema = z.object({
  save_last_analysis_payload: z.boolean().prefault(createDefaultBattleDebugConfig().save_last_analysis_payload),
  save_last_runtime_payload: z.boolean().prefault(createDefaultBattleDebugConfig().save_last_runtime_payload),
  save_last_ai_raw_text: z.boolean().prefault(createDefaultBattleDebugConfig().save_last_ai_raw_text),
  allow_retry_on_invalid_json: z.boolean().prefault(createDefaultBattleDebugConfig().allow_retry_on_invalid_json),
});

export const BattleProfileSchema = z.object({
  id: trimmedString().prefault(''),
  name: trimmedString().prefault(''),
  enabled: z.boolean().prefault(true),
  description: trimmedString().prefault(''),
  api_profile_id: z.string().nullable().prefault(null),
  run_mode: z.enum(['dice_driven', 'freeform']).prefault('dice_driven'),
  default_turn_mode: z.enum(['round_based', 'full_battle']).prefault('round_based'),
  settlement_mode: z.enum(['no_loot', 'direct_loot', 'checked_loot']).prefault('checked_loot'),
  rules: BattleRulesConfigSchema.prefault(createDefaultBattleRulesConfig()),
  field_selection: BattleFieldSelectionConfigSchema.prefault(createDefaultBattleFieldSelectionConfig()),
  prompts: BattlePromptConfigSchema.prefault(createDefaultBattlePromptConfig()),
  context: BattleContextConfigSchema.prefault(createDefaultBattleContextConfig()),
  output: BattleOutputConfigSchema.prefault(createDefaultBattleOutputConfig()),
  debug: BattleDebugConfigSchema.prefault(createDefaultBattleDebugConfig()),
  created_at: nonNegativeInteger().prefault(0),
  updated_at: nonNegativeInteger().prefault(0),
});

export const BattleUiPreferencesSchema = z.object({
  selected_data_tree_expanded_paths: stringArray(),
  field_browser_expanded_paths: stringArray(),
  active_settings_tab: trimmedString(createDefaultBattleUiPreferences().active_settings_tab).prefault(
    createDefaultBattleUiPreferences().active_settings_tab,
  ),
});

export const BattleFrontendSettingsSchema = z.object({
  version: nonNegativeInteger(BATTLE_FRONTEND_SETTINGS_VERSION).prefault(BATTLE_FRONTEND_SETTINGS_VERSION),
  active_api_profile_id: z.string().nullable().prefault(null),
  active_battle_profile_id: z.string().nullable().prefault(null),
  api_profiles: z.array(BattleApiProfileSchema).prefault([]),
  battle_profiles: z.array(BattleProfileSchema).prefault([]),
  ui_preferences: BattleUiPreferencesSchema.prefault(createDefaultBattleUiPreferences()),
});

type BattleFrontendSettingsBindings = {
  readVariables: (option: VariableOption) => Record<string, any>;
  writeVariables: (
    updater: (variables: Record<string, any>) => Record<string, any>,
    option: VariableOption,
  ) => Record<string, any>;
};

type BattleFrontendSettingsUpdate = (
  draft: BattleFrontendSettings,
  current: BattleFrontendSettings,
) => BattleFrontendSettings | void;

type BattleFrontendSettingsAccess = ReturnType<typeof createBattleFrontendSettingsAccess>;

type MemoryBattleFrontendSettingsAccess = BattleFrontendSettingsAccess & {
  getVariables: () => Record<string, any>;
};

const runtimeBindings: BattleFrontendSettingsBindings = {
  readVariables: option => getVariables(option),
  writeVariables: (updater, option) => updateVariablesWith(updater, option),
};

function looksLikeLegacySettingsRoot(variables: Record<string, any>): boolean {
  return LEGACY_ROOT_KEYS.some(key => _.has(variables, key));
}

function readStoredBattleFrontendSettings(variables: Record<string, any>): unknown {
  const nested = _.get(variables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY);
  if (_.isPlainObject(nested)) {
    return nested;
  }
  if (looksLikeLegacySettingsRoot(variables)) {
    return variables;
  }
  return {};
}

function writeStoredBattleFrontendSettings(
  variables: Record<string, any>,
  settings: BattleFrontendSettings,
): Record<string, any> {
  const nextVariables = klona(variables);
  for (const key of LEGACY_ROOT_KEYS) {
    delete nextVariables[key];
  }
  _.set(nextVariables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY, klona(settings));
  return nextVariables;
}

function normalizeEntityId(id: string, prefix: 'api' | 'battle', seen: Set<string>): string {
  let nextId = id.trim();
  while (!nextId || seen.has(nextId)) {
    nextId = createBattleFrontendEntityId(prefix);
  }
  seen.add(nextId);
  return nextId;
}

function normalizeProfileTimestamps(createdAt: number, updatedAt: number): { createdAt: number; updatedAt: number } {
  const now = Date.now();
  const nextCreatedAt = createdAt > 0 ? createdAt : now;
  const nextUpdatedAt = updatedAt > 0 ? updatedAt : nextCreatedAt;
  return { createdAt: nextCreatedAt, updatedAt: nextUpdatedAt };
}

function normalizeBattleApiProfiles(apiProfiles: BattleApiProfile[]): BattleApiProfile[] {
  const seen = new Set<string>();
  return apiProfiles.map((apiProfile, index) => {
    const id = normalizeEntityId(apiProfile.id, 'api', seen);
    const timestamps = normalizeProfileTimestamps(apiProfile.created_at, apiProfile.updated_at);
    return {
      ...apiProfile,
      id,
      name: apiProfile.name || `接口 ${index + 1}`,
      model_fetch_path: apiProfile.model_fetch_path || '/v1/models',
      created_at: timestamps.createdAt,
      updated_at: timestamps.updatedAt,
    };
  });
}

function normalizeBattleFieldSelectionConfig(fieldSelection: BattleFieldSelectionConfig): BattleFieldSelectionConfig {
  const seen = new Set<string>();
  return {
    ...fieldSelection,
    selected_fields: fieldSelection.selected_fields.map(field => {
      const path = field.path.trim();
      const dedupeKey = path || `${field.source}:${field.label}:${field.reason}`;
      const enabled = field.enabled && path.startsWith('stat_data.');
      if (seen.has(dedupeKey)) {
        return { ...field, path, enabled: false };
      }
      seen.add(dedupeKey);
      return { ...field, path, enabled };
    }),
  };
}

function normalizeBattleProfiles(battleProfiles: BattleProfile[], activeApiProfileId: string | null): BattleProfile[] {
  const seen = new Set<string>();
  return battleProfiles.map((battleProfile, index) => {
    const id = normalizeEntityId(battleProfile.id, 'battle', seen);
    const timestamps = normalizeProfileTimestamps(battleProfile.created_at, battleProfile.updated_at);
    return {
      ...battleProfile,
      id,
      name: battleProfile.name || `战斗配置 ${index + 1}`,
      api_profile_id: battleProfile.api_profile_id?.trim() || activeApiProfileId,
      field_selection: normalizeBattleFieldSelectionConfig(battleProfile.field_selection),
      created_at: timestamps.createdAt,
      updated_at: timestamps.updatedAt,
    };
  });
}

function resolveActiveProfileId<T extends { id: string }>(profiles: T[], preferredId: string | null): string | null {
  if (preferredId && profiles.some(profile => profile.id === preferredId)) {
    return preferredId;
  }
  return profiles[0]?.id ?? null;
}

function normalizeBattleFrontendSettings(input: unknown): BattleFrontendSettings {
  const parsed = BattleFrontendSettingsSchema.parse(input, { reportInput: true });
  let apiProfiles = normalizeBattleApiProfiles(parsed.api_profiles);
  if (apiProfiles.length === 0) {
    apiProfiles = [createDefaultBattleApiProfile()];
  }

  let activeApiProfileId = resolveActiveProfileId(apiProfiles, parsed.active_api_profile_id);
  let battleProfiles = normalizeBattleProfiles(parsed.battle_profiles, activeApiProfileId);
  if (battleProfiles.length === 0) {
    battleProfiles = [createDefaultBattleProfile(activeApiProfileId)];
  }

  const validApiIds = new Set(apiProfiles.map(profile => profile.id));
  battleProfiles = battleProfiles.map(battleProfile => ({
    ...battleProfile,
    api_profile_id:
      battleProfile.api_profile_id && validApiIds.has(battleProfile.api_profile_id)
        ? battleProfile.api_profile_id
        : activeApiProfileId,
  }));

  activeApiProfileId = resolveActiveProfileId(apiProfiles, activeApiProfileId);
  const activeBattleProfileId = resolveActiveProfileId(battleProfiles, parsed.active_battle_profile_id);

  return {
    version: BATTLE_FRONTEND_SETTINGS_VERSION,
    active_api_profile_id: activeApiProfileId,
    active_battle_profile_id: activeBattleProfileId,
    api_profiles: apiProfiles,
    battle_profiles: battleProfiles,
    ui_preferences: BattleUiPreferencesSchema.parse(parsed.ui_preferences, { reportInput: true }),
  };
}

export function createBattleFrontendSettingsAccess(bindings: BattleFrontendSettingsBindings = runtimeBindings) {
  const read = (variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION): BattleFrontendSettings =>
    normalizeBattleFrontendSettings(readStoredBattleFrontendSettings(bindings.readVariables(variableOption)));

  const load = (variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION): BattleFrontendSettings => {
    let loaded: BattleFrontendSettings | null = null;
    bindings.writeVariables(variables => {
      loaded = normalizeBattleFrontendSettings(readStoredBattleFrontendSettings(variables));
      return writeStoredBattleFrontendSettings(variables, loaded);
    }, variableOption);
    if (!loaded) {
      throw new Error('failed to load battle frontend settings');
    }
    return loaded;
  };

  const replace = (
    settings: BattleFrontendSettings,
    variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
  ): BattleFrontendSettings => {
    const normalized = normalizeBattleFrontendSettings(settings);
    bindings.writeVariables(variables => writeStoredBattleFrontendSettings(variables, normalized), variableOption);
    return normalized;
  };

  const update = (
    mutate: BattleFrontendSettingsUpdate,
    variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
  ): BattleFrontendSettings => {
    let updated: BattleFrontendSettings | null = null;
    bindings.writeVariables(variables => {
      const current = normalizeBattleFrontendSettings(readStoredBattleFrontendSettings(variables));
      const draft = klona(current);
      const next = mutate(draft, current) ?? draft;
      updated = normalizeBattleFrontendSettings(next);
      return writeStoredBattleFrontendSettings(variables, updated);
    }, variableOption);
    if (!updated) {
      throw new Error('failed to update battle frontend settings');
    }
    return updated;
  };

  return {
    read,
    load,
    replace,
    update,
    reset: (variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION) =>
      replace(createDefaultBattleFrontendSettings(), variableOption),
    setActiveApiProfileId: (
      apiProfileId: string | null,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        draft.active_api_profile_id = apiProfileId;
      }, variableOption),
    setActiveBattleProfileId: (
      battleProfileId: string | null,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        draft.active_battle_profile_id = battleProfileId;
      }, variableOption),
    saveApiProfile: (
      apiProfile: BattleApiProfile,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        const index = draft.api_profiles.findIndex(profile => profile.id === apiProfile.id);
        if (index >= 0) {
          draft.api_profiles[index] = apiProfile;
        } else {
          draft.api_profiles.push(apiProfile);
        }
        if (!draft.active_api_profile_id) {
          draft.active_api_profile_id = apiProfile.id;
        }
      }, variableOption),
    removeApiProfile: (
      apiProfileId: string,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        draft.api_profiles = draft.api_profiles.filter(profile => profile.id !== apiProfileId);
      }, variableOption),
    saveBattleProfile: (
      battleProfile: BattleProfile,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        const index = draft.battle_profiles.findIndex(profile => profile.id === battleProfile.id);
        if (index >= 0) {
          draft.battle_profiles[index] = battleProfile;
        } else {
          draft.battle_profiles.push(battleProfile);
        }
        if (!draft.active_battle_profile_id) {
          draft.active_battle_profile_id = battleProfile.id;
        }
      }, variableOption),
    removeBattleProfile: (
      battleProfileId: string,
      variableOption: VariableOption = BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      update(draft => {
        draft.battle_profiles = draft.battle_profiles.filter(profile => profile.id !== battleProfileId);
      }, variableOption),
    getActiveApiProfile: (
      settings: BattleFrontendSettings,
    ): BattleApiProfile | null =>
      settings.api_profiles.find(profile => profile.id === settings.active_api_profile_id) ?? null,
    getActiveBattleProfile: (
      settings: BattleFrontendSettings,
    ): BattleProfile | null =>
      settings.battle_profiles.find(profile => profile.id === settings.active_battle_profile_id) ?? null,
  };
}

export function createMemoryBattleFrontendSettingsAccess(
  initialVariables: Record<string, any> = {},
): MemoryBattleFrontendSettingsAccess {
  let variables = klona(initialVariables);
  const access = createBattleFrontendSettingsAccess({
    readVariables: () => klona(variables),
    writeVariables: updater => {
      variables = klona(updater(klona(variables)));
      return klona(variables);
    },
  });

  return {
    ...access,
    getVariables: () => klona(variables),
  };
}

export const battleFrontendSettingsAccess = createBattleFrontendSettingsAccess();
