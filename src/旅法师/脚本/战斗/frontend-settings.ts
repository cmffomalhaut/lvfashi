import { klona } from 'klona';
import {
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
  createDefaultBattleRequestOptions,
  createDefaultBattleRulesConfig,
  createDefaultBattleUiPreferences,
  type BattleApiProfile,
  type BattleDebugConfig,
  type BattleFieldSelectionConfig,
  type BattleFrontendSettings,
  type BattleOutputConfig,
  type BattleProfile,
  type BattlePromptConfig,
  type BattleRequestOptions,
  type BattleRulesConfig,
  type BattleUiPreferences,
} from './ai-profile';

export const BATTLE_FRONTEND_SETTINGS_VERSION = 1;
export const BATTLE_FRONTEND_SETTINGS_STORAGE_KEY = 'battle_frontend_settings';
export const DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION = Object.freeze({ type: 'script' } as const);

const LEGACY_ROOT_KEYS = [
  'version',
  'active_api_profile_id',
  'active_battle_profile_id',
  'api_profiles',
  'battle_profiles',
  'ui_preferences',
] as const;

type BattleFrontendSettingsBindings = {
  readVariables: (option: VariableOption) => Record<string, any>;
  writeVariables: (
    updater: (variables: Record<string, any>) => Record<string, any> | Promise<Record<string, any>>,
    option: VariableOption,
  ) => Record<string, any> | Promise<Record<string, any>>;
};

type SettingsMutation = (
  draft: BattleFrontendSettings,
  before: BattleFrontendSettings,
) => BattleFrontendSettings | void | Promise<BattleFrontendSettings | void>;

type UpsertProfileOptions = {
  makeActive?: boolean;
};

type MemoryBattleFrontendSettingsAccess = BattleFrontendSettingsAccess & {
  getVariables: () => Record<string, any>;
};

const runtimeBindings: BattleFrontendSettingsBindings = {
  readVariables: option => getVariables(option),
  writeVariables: (updater, option) => updateVariablesWith(updater, option),
};

const trimmedString = (fallback = '') => z.string().transform(value => value.trim()).catch(fallback).prefault(fallback);
const booleanWithFallback = (fallback = false) => z.boolean().catch(fallback).prefault(fallback);
const finiteNumber = (fallback = 0) =>
  z.coerce
    .number()
    .transform(value => (Number.isFinite(value) ? value : fallback))
    .catch(fallback)
    .prefault(fallback);
const nullableString = () => z.union([z.string(), z.null()]).catch(null).prefault(null);
const nullableFiniteNumber = () =>
  z
    .union([
      z.null(),
      z.coerce.number().transform(value => (Number.isFinite(value) ? value : 0)),
    ])
    .catch(null)
    .prefault(null);

export const BattleRequestOptionsSchema = z
  .object({
    temperature: nullableFiniteNumber(),
    top_p: nullableFiniteNumber(),
    max_tokens: nullableFiniteNumber(),
    timeout_ms: finiteNumber(createDefaultBattleRequestOptions().timeout_ms),
    enable_stream: booleanWithFallback(createDefaultBattleRequestOptions().enable_stream),
    enable_reasoning_content: booleanWithFallback(createDefaultBattleRequestOptions().enable_reasoning_content),
    retry_limit: finiteNumber(createDefaultBattleRequestOptions().retry_limit),
  })
  .prefault({});

export const BattleModelDiscoveryConfigSchema = z
  .object({
    enabled: booleanWithFallback(createDefaultBattleModelDiscoveryConfig().enabled),
    use_auth_header: booleanWithFallback(createDefaultBattleModelDiscoveryConfig().use_auth_header),
    response_path: trimmedString(createDefaultBattleModelDiscoveryConfig().response_path),
  })
  .prefault({});

export const BattleApiTestResultSchema = z
  .object({
    ok: booleanWithFallback(false),
    checked_at: finiteNumber(0),
    message: trimmedString(''),
    model_count: nullableFiniteNumber(),
  })
  .prefault({});

export const BattleApiProfileSchema = z
  .object({
    id: trimmedString(''),
    name: trimmedString('未命名接口'),
    enabled: booleanWithFallback(true),
    provider_type: z.enum(['openai_compatible', 'custom']).catch('openai_compatible').prefault('openai_compatible'),
    base_url: trimmedString(''),
    api_key: trimmedString(''),
    model: trimmedString(''),
    model_fetch_path: trimmedString('/v1/models'),
    headers: z.record(z.string(), z.string()).catch({}).prefault({}),
    default_request_options: BattleRequestOptionsSchema,
    model_discovery: BattleModelDiscoveryConfigSchema,
    last_test_result: z.union([BattleApiTestResultSchema, z.null()]).catch(null).prefault(null),
    created_at: finiteNumber(0),
    updated_at: finiteNumber(0),
  })
  .prefault({});

export const BattleRulesConfigSchema = z
  .object({
    battle_protocol: trimmedString(createDefaultBattleRulesConfig().battle_protocol),
    loot_protocol: trimmedString(createDefaultBattleRulesConfig().loot_protocol),
    extra_world_rules: trimmedString(createDefaultBattleRulesConfig().extra_world_rules),
    player_intent_priority: z.literal('high').catch('high').prefault('high'),
    allow_full_stat_data_in_analysis: booleanWithFallback(createDefaultBattleRulesConfig().allow_full_stat_data_in_analysis),
    forbid_full_stat_data_in_runtime: booleanWithFallback(createDefaultBattleRulesConfig().forbid_full_stat_data_in_runtime),
    schema_hint_enabled: booleanWithFallback(createDefaultBattleRulesConfig().schema_hint_enabled),
  })
  .prefault({});

export const BattleSelectedFieldSchema = z
  .object({
    path: trimmedString(''),
    label: trimmedString(''),
    enabled: booleanWithFallback(true),
    source: z.enum(['ai', 'manual']).catch('manual').prefault('manual'),
    reason: trimmedString(''),
    value_kind: z.enum(['unknown', 'scalar', 'object', 'array']).catch('unknown').prefault('unknown'),
  })
  .prefault({});

export const BattleFieldSelectionConfigSchema = z
  .object({
    selected_fields: z.array(BattleSelectedFieldSchema).catch([]).prefault([]),
    analysis_warnings: z.array(z.string()).catch([]).prefault([]),
    last_analysis_input_hash: trimmedString(createDefaultBattleFieldSelectionConfig().last_analysis_input_hash),
    last_analysis_at: nullableFiniteNumber(),
    manual_review_required: booleanWithFallback(createDefaultBattleFieldSelectionConfig().manual_review_required),
  })
  .prefault({});

export const BattlePromptTemplateSchema = z
  .object({
    enabled: booleanWithFallback(true),
    version: finiteNumber(1),
    title: trimmedString('未命名模板'),
    system_prompt: z.string().catch('').prefault(''),
    user_prompt: z.string().catch('').prefault(''),
    output_contract_prompt: z.string().catch('').prefault(''),
    notes: z.string().catch('').prefault(''),
  })
  .prefault({});

export const BattlePromptConfigSchema = z
  .object({
    field_analysis: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptConfig().field_analysis),
    single_round: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptConfig().single_round),
    full_battle: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptConfig().full_battle),
    loot_resolution: BattlePromptTemplateSchema.prefault(createDefaultBattlePromptConfig().loot_resolution),
  })
  .prefault({});

export const BattleContextConfigSchema = z
  .object({
    include_worldbook_context: booleanWithFallback(createDefaultBattleContextConfig().include_worldbook_context),
    include_environment_context: booleanWithFallback(createDefaultBattleContextConfig().include_environment_context),
    include_floor_context: booleanWithFallback(createDefaultBattleContextConfig().include_floor_context),
    include_recent_battle_report: booleanWithFallback(createDefaultBattleContextConfig().include_recent_battle_report),
    extra_context_text: z.string().catch('').prefault(''),
  })
  .prefault({});

export const BattleOutputConfigSchema = z
  .object({
    round_narration_style: z.enum(['minimal', 'balanced', 'detailed']).catch('balanced').prefault('balanced'),
    full_battle_report_target_words: finiteNumber(createDefaultBattleOutputConfig().full_battle_report_target_words),
    append_report_to_tavern_input: booleanWithFallback(createDefaultBattleOutputConfig().append_report_to_tavern_input),
    show_raw_json_preview: booleanWithFallback(createDefaultBattleOutputConfig().show_raw_json_preview),
  })
  .prefault({});

export const BattleDebugConfigSchema = z
  .object({
    save_last_analysis_payload: booleanWithFallback(createDefaultBattleDebugConfig().save_last_analysis_payload),
    save_last_runtime_payload: booleanWithFallback(createDefaultBattleDebugConfig().save_last_runtime_payload),
    save_last_ai_raw_text: booleanWithFallback(createDefaultBattleDebugConfig().save_last_ai_raw_text),
    allow_retry_on_invalid_json: booleanWithFallback(createDefaultBattleDebugConfig().allow_retry_on_invalid_json),
  })
  .prefault({});

export const BattleProfileSchema = z
  .object({
    id: trimmedString(''),
    name: trimmedString('未命名战斗配置'),
    enabled: booleanWithFallback(true),
    description: z.string().catch('').prefault(''),
    api_profile_id: nullableString(),
    run_mode: z.enum(['dice_driven', 'freeform']).catch('dice_driven').prefault('dice_driven'),
    default_turn_mode: z.enum(['round_based', 'full_battle']).catch('round_based').prefault('round_based'),
    settlement_mode: z.enum(['no_loot', 'direct_loot', 'checked_loot']).catch('checked_loot').prefault('checked_loot'),
    rules: BattleRulesConfigSchema,
    field_selection: BattleFieldSelectionConfigSchema,
    prompts: BattlePromptConfigSchema,
    context: BattleContextConfigSchema,
    output: BattleOutputConfigSchema,
    debug: BattleDebugConfigSchema,
    created_at: finiteNumber(0),
    updated_at: finiteNumber(0),
  })
  .prefault({});

export const BattleUiPreferencesSchema = z
  .object({
    selected_data_tree_expanded_paths: z.array(z.string()).catch([]).prefault([]),
    field_browser_expanded_paths: z.array(z.string()).catch([]).prefault([]),
    active_settings_tab: trimmedString(createDefaultBattleUiPreferences().active_settings_tab),
  })
  .prefault({});

export const BattleFrontendSettingsSchema = z
  .object({
    version: z.literal(BATTLE_FRONTEND_SETTINGS_VERSION).catch(BATTLE_FRONTEND_SETTINGS_VERSION).prefault(BATTLE_FRONTEND_SETTINGS_VERSION),
    active_api_profile_id: nullableString(),
    active_battle_profile_id: nullableString(),
    api_profiles: z.array(BattleApiProfileSchema).catch([]).prefault([]),
    battle_profiles: z.array(BattleProfileSchema).catch([]).prefault([]),
    ui_preferences: BattleUiPreferencesSchema,
  })
  .prefault({});

function extractSettingsCandidate(variables: Record<string, any>): unknown {
  return _.has(variables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY)
    ? _.get(variables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY)
    : variables;
}

function hasLegacyRootStorage(variables: Record<string, any>): boolean {
  return !_.has(variables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY) && LEGACY_ROOT_KEYS.some(key => _.has(variables, key));
}

function writeSettingsToVariables(
  variables: Record<string, any>,
  settings: BattleFrontendSettings,
  shouldCleanupLegacyRoot: boolean,
): Record<string, any> {
  const nextVariables = klona(variables);
  _.set(nextVariables, BATTLE_FRONTEND_SETTINGS_STORAGE_KEY, settings);

  if (shouldCleanupLegacyRoot) {
    for (const key of LEGACY_ROOT_KEYS) {
      _.unset(nextVariables, key);
    }
  }

  return nextVariables;
}

function ensureUniqueProfileIds<T extends { id: string }>(profiles: T[], prefix: 'api' | 'battle'): T[] {
  const usedIds = new Set<string>();

  return profiles.map(profile => {
    let nextId = profile.id.trim();
    if (!nextId || usedIds.has(nextId)) {
      nextId = createBattleFrontendEntityId(prefix);
    }
    usedIds.add(nextId);
    return nextId === profile.id ? profile : { ...profile, id: nextId };
  });
}

function resolveActiveProfileId<T extends { id: string }>(profiles: T[], activeId: string | null): string | null {
  if (activeId && profiles.some(profile => profile.id === activeId)) {
    return activeId;
  }
  return profiles[0]?.id ?? null;
}

function normalizeBattleFrontendSettings(settings: BattleFrontendSettings): BattleFrontendSettings {
  const next = klona(settings);
  next.version = BATTLE_FRONTEND_SETTINGS_VERSION;

  let apiProfiles = ensureUniqueProfileIds(next.api_profiles, 'api');
  if (apiProfiles.length === 0) {
    apiProfiles = [createDefaultBattleApiProfile()];
  }
  const activeApiProfileId = resolveActiveProfileId(apiProfiles, next.active_api_profile_id);

  let battleProfiles = ensureUniqueProfileIds(next.battle_profiles, 'battle');
  if (battleProfiles.length === 0) {
    battleProfiles = [createDefaultBattleProfile(activeApiProfileId)];
  }

  const validApiProfileIds = new Set(apiProfiles.map(profile => profile.id));
  battleProfiles = battleProfiles.map(profile => ({
    ...profile,
    api_profile_id:
      profile.api_profile_id && validApiProfileIds.has(profile.api_profile_id) ? profile.api_profile_id : activeApiProfileId,
  }));

  const activeBattleProfileId = resolveActiveProfileId(battleProfiles, next.active_battle_profile_id);

  return BattleFrontendSettingsSchema.parse(
    {
      ...next,
      version: BATTLE_FRONTEND_SETTINGS_VERSION,
      active_api_profile_id: activeApiProfileId,
      active_battle_profile_id: activeBattleProfileId,
      api_profiles: apiProfiles,
      battle_profiles: battleProfiles,
    },
    { reportInput: true },
  );
}

export function migrateBattleFrontendSettings(raw: unknown): BattleFrontendSettings {
  const candidate = raw && typeof raw === 'object' ? raw : {};
  const version = _.get(candidate, 'version');

  if (version !== undefined && version !== BATTLE_FRONTEND_SETTINGS_VERSION) {
    // Placeholder for future explicit migrations once schema versions diverge.
  }

  return normalizeBattleFrontendSettings(BattleFrontendSettingsSchema.parse(candidate, { reportInput: true }));
}

function buildSavedApiProfile(profile: BattleApiProfile, previous: BattleApiProfile | undefined): BattleApiProfile {
  const now = Date.now();
  return BattleApiProfileSchema.parse(
    {
      ...(previous ?? createDefaultBattleApiProfile()),
      ...klona(profile),
      id: profile.id.trim() || previous?.id || createBattleFrontendEntityId('api'),
      created_at: previous?.created_at ?? profile.created_at ?? now,
      updated_at: now,
    },
    { reportInput: true },
  );
}

function buildSavedBattleProfile(profile: BattleProfile, previous: BattleProfile | undefined): BattleProfile {
  const now = Date.now();
  return BattleProfileSchema.parse(
    {
      ...(previous ?? createDefaultBattleProfile(profile.api_profile_id)),
      ...klona(profile),
      id: profile.id.trim() || previous?.id || createBattleFrontendEntityId('battle'),
      created_at: previous?.created_at ?? profile.created_at ?? now,
      updated_at: now,
    },
    { reportInput: true },
  );
}

export function createBattleFrontendSettingsAccess(bindings: BattleFrontendSettingsBindings = runtimeBindings) {
  const read = (variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION): BattleFrontendSettings =>
    migrateBattleFrontendSettings(extractSettingsCandidate(bindings.readVariables(variableOption)));

  const mutateAndPersist = async (
    mutate: SettingsMutation,
    variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
  ): Promise<BattleFrontendSettings> => {
    let resolvedSettings = createDefaultBattleFrontendSettings();

    await Promise.resolve(
      bindings.writeVariables(async variables => {
        const before = migrateBattleFrontendSettings(extractSettingsCandidate(variables));
        const draft = klona(before);
        const mutated = await mutate(draft, before);
        const normalized = normalizeBattleFrontendSettings(mutated ?? draft);
        resolvedSettings = normalized;
        return writeSettingsToVariables(variables, normalized, hasLegacyRootStorage(variables));
      }, variableOption),
    );

    return resolvedSettings;
  };

  return {
    read,
    load: (variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION) =>
      mutateAndPersist(draft => draft, variableOption),
    replace: (
      settings: BattleFrontendSettings,
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) => mutateAndPersist(() => settings, variableOption),
    update: (mutate: SettingsMutation, variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION) =>
      mutateAndPersist(mutate, variableOption),
    upsertApiProfile: (
      profile: BattleApiProfile,
      options: UpsertProfileOptions = {},
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        const currentIndex = draft.api_profiles.findIndex(current => current.id === profile.id);
        const previous = currentIndex >= 0 ? draft.api_profiles[currentIndex] : undefined;
        const savedProfile = buildSavedApiProfile(profile, previous);

        if (currentIndex >= 0) {
          draft.api_profiles[currentIndex] = savedProfile;
        } else {
          draft.api_profiles.push(savedProfile);
        }

        if (options.makeActive || !draft.active_api_profile_id) {
          draft.active_api_profile_id = savedProfile.id;
        }
      }, variableOption),
    removeApiProfile: (
      profileId: string,
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        draft.api_profiles = draft.api_profiles.filter(profile => profile.id !== profileId);
        if (draft.active_api_profile_id === profileId) {
          draft.active_api_profile_id = null;
        }
        draft.battle_profiles = draft.battle_profiles.map(profile =>
          profile.api_profile_id === profileId ? { ...profile, api_profile_id: null } : profile,
        );
      }, variableOption),
    setActiveApiProfile: (
      profileId: string | null,
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        draft.active_api_profile_id = profileId;
      }, variableOption),
    upsertBattleProfile: (
      profile: BattleProfile,
      options: UpsertProfileOptions = {},
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        const currentIndex = draft.battle_profiles.findIndex(current => current.id === profile.id);
        const previous = currentIndex >= 0 ? draft.battle_profiles[currentIndex] : undefined;
        const savedProfile = buildSavedBattleProfile(profile, previous);

        if (currentIndex >= 0) {
          draft.battle_profiles[currentIndex] = savedProfile;
        } else {
          draft.battle_profiles.push(savedProfile);
        }

        if (options.makeActive || !draft.active_battle_profile_id) {
          draft.active_battle_profile_id = savedProfile.id;
        }
      }, variableOption),
    removeBattleProfile: (
      profileId: string,
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        draft.battle_profiles = draft.battle_profiles.filter(profile => profile.id !== profileId);
        if (draft.active_battle_profile_id === profileId) {
          draft.active_battle_profile_id = null;
        }
      }, variableOption),
    setActiveBattleProfile: (
      profileId: string | null,
      variableOption: VariableOption = DEFAULT_BATTLE_FRONTEND_SETTINGS_VARIABLE_OPTION,
    ) =>
      mutateAndPersist(draft => {
        draft.active_battle_profile_id = profileId;
      }, variableOption),
  };
}

export type BattleFrontendSettingsAccess = ReturnType<typeof createBattleFrontendSettingsAccess>;

export function createMemoryBattleFrontendSettingsAccess(
  initialVariables: Record<string, any> = {},
): MemoryBattleFrontendSettingsAccess {
  let variables = klona(initialVariables);

  const access = createBattleFrontendSettingsAccess({
    readVariables: () => klona(variables),
    writeVariables: async updater => {
      variables = klona(await updater(klona(variables)));
      return variables;
    },
  });

  return {
    ...access,
    getVariables: () => klona(variables),
  };
}

export const battleFrontendSettingsAccess = createBattleFrontendSettingsAccess();

export type BattleFrontendSettingsSchemaOutput = z.output<typeof BattleFrontendSettingsSchema>;
export type BattleApiProfileSchemaOutput = z.output<typeof BattleApiProfileSchema>;
export type BattleProfileSchemaOutput = z.output<typeof BattleProfileSchema>;
export type BattleRequestOptionsSchemaOutput = BattleRequestOptions;
export type BattleRulesConfigSchemaOutput = BattleRulesConfig;
export type BattleFieldSelectionConfigSchemaOutput = BattleFieldSelectionConfig;
export type BattlePromptConfigSchemaOutput = BattlePromptConfig;
export type BattleOutputConfigSchemaOutput = BattleOutputConfig;
export type BattleDebugConfigSchemaOutput = BattleDebugConfig;
export type BattleUiPreferencesSchemaOutput = BattleUiPreferences;
