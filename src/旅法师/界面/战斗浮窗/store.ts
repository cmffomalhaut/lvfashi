import { klona } from 'klona';
import { type BattleSession, type MainState, Schema } from '../../schema.ts';
import { projectBattleSession, projectMainState, stateAccess } from '../../脚本/MVU/state-access.ts';
import {
  createDefaultBattleApiProfile,
  createDefaultBattleProfile,
  type BattleApiProfile,
  type BattleFieldAnalysisPayload,
  type BattleFieldAnalysisResult,
  type BattleFullResult,
  type BattleLootResult,
  type BattleProfile,
  type BattleRoundResult,
  type BattleFrontendSettings,
} from '../../脚本/战斗/ai-profile.ts';
import { fetchBattleApiModels, testBattleApiConnection } from '../../脚本/战斗/api-client.ts';
import { analyzeBattleFields } from '../../脚本/战斗/field-analysis.ts';
import { battleFrontendSettingsAccess } from '../../脚本/战斗/frontend-settings.ts';
import {
  requestBattleFullBattle,
  requestBattleLootResolution,
  requestBattleSingleRound,
  type BattleRuntimeRequestOptions,
} from '../../脚本/战斗/runtime-ai.ts';
import { battleSessionController } from '../../脚本/战斗/session.ts';

function resolveLatestMessageId(): number {
  return Number(getCurrentMessageId?.() ?? -1);
}

export const useBattleWindowStore = defineStore('planeswalker.battle-window', () => {
  const canonicalState = ref(Schema.parse({}, { reportInput: true }));
  const settings = ref<BattleFrontendSettings>(battleFrontendSettingsAccess.read());
  const discoveredModels = ref<Record<string, string[]>>({});
  const isResolving = ref(false);
  const isApiBusy = ref(false);
  const isFieldAnalysisBusy = ref(false);
  const isRuntimeRequestBusy = ref(false);
  const lastResolveError = ref('');
  const lastApiMessage = ref('');
  const lastApiError = ref('');
  const lastFieldAnalysisMessage = ref('');
  const lastFieldAnalysisError = ref('');
  const lastFieldAnalysisPayload = ref<BattleFieldAnalysisPayload | null>(null);
  const lastFieldAnalysisResult = ref<BattleFieldAnalysisResult | null>(null);
  const lastRuntimeRequestMessage = ref('');
  const lastRuntimeRequestError = ref('');
  const lastRuntimePayload = ref<Record<string, unknown> | null>(null);
  const lastRuntimeResult = ref<BattleRoundResult | BattleFullResult | BattleLootResult | null>(null);

  const refresh = () => {
    canonicalState.value = stateAccess.readCanonicalState();
  };

  const refreshSettings = async () => {
    settings.value = await battleFrontendSettingsAccess.load();
  };

  refresh();
  useIntervalFn(refresh, 1000);
  void refreshSettings();

  const mainState = computed<MainState>(() => klona(projectMainState(canonicalState.value)));
  const battleSession = computed<BattleSession>(() => klona(projectBattleSession(canonicalState.value)));
  const apiProfiles = computed(() => settings.value.api_profiles.map(profile => klona(profile)));
  const activeApiProfile = computed<BattleApiProfile | null>(
    () => settings.value.api_profiles.find(profile => profile.id === settings.value.active_api_profile_id) ?? null,
  );
  const battleProfiles = computed(() => settings.value.battle_profiles.map(profile => klona(profile)));
  const activeBattleProfile = computed<BattleProfile | null>(
    () => settings.value.battle_profiles.find(profile => profile.id === settings.value.active_battle_profile_id) ?? null,
  );
  const discoveredActiveModels = computed(() => {
    const profile = activeApiProfile.value;
    return profile ? discoveredModels.value[profile.id] ?? [] : [];
  });
  const enemyCount = computed(() => Object.keys(mainState.value.敌方).length);
  const sourceMessageId = computed(() => resolveLatestMessageId());
  const canResume = computed(
    () => battleSession.value.激活 && battleSession.value.meta.source_message_id === sourceMessageId.value,
  );
  const roundCheckpointDirty = computed(
    () =>
      battleSession.value.phase !== battleSession.value.round_checkpoint.phase ||
      !_.isEqual(battleSession.value.player_check, battleSession.value.round_checkpoint.player_check) ||
      !_.isEqual(battleSession.value.shared_dark_pool, battleSession.value.round_checkpoint.shared_dark_pool) ||
      !_.isEqual(battleSession.value.pending_preview, battleSession.value.round_checkpoint.pending_preview) ||
      !_.isEqual(battleSession.value.combatants, battleSession.value.round_checkpoint.combatants),
  );

  const runAndRefresh = async <T>(action: () => Promise<T>) => {
    const result = await action();
    refresh();
    return result;
  };

  const runApiAction = async <T>(action: () => Promise<T>) => {
    isApiBusy.value = true;
    lastApiMessage.value = '';
    lastApiError.value = '';

    try {
      return await action();
    } catch (error) {
      lastApiError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isApiBusy.value = false;
    }
  };

  const runFieldAnalysisAction = async <T>(action: () => Promise<T>) => {
    isFieldAnalysisBusy.value = true;
    lastFieldAnalysisMessage.value = '';
    lastFieldAnalysisError.value = '';

    try {
      return await action();
    } catch (error) {
      lastFieldAnalysisError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isFieldAnalysisBusy.value = false;
    }
  };

  const runRuntimeRequestAction = async <T>(action: () => Promise<T>) => {
    isRuntimeRequestBusy.value = true;
    lastRuntimeRequestMessage.value = '';
    lastRuntimeRequestError.value = '';

    try {
      return await action();
    } catch (error) {
      lastRuntimeRequestError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isRuntimeRequestBusy.value = false;
    }
  };

  const createApiProfile = async () => {
    settings.value = await battleFrontendSettingsAccess.upsertApiProfile(createDefaultBattleApiProfile(), {
      makeActive: true,
    });
  };

  const saveApiProfile = async (profile: BattleApiProfile, options: { makeActive?: boolean } = {}) => {
    settings.value = await battleFrontendSettingsAccess.upsertApiProfile(profile, options);
  };

  const removeApiProfile = async (profileId: string) => {
    settings.value = await battleFrontendSettingsAccess.removeApiProfile(profileId);
    delete discoveredModels.value[profileId];
  };

  const setActiveApiProfile = async (profileId: string | null) => {
    settings.value = await battleFrontendSettingsAccess.setActiveApiProfile(profileId);
  };

  const createBattleProfile = async () => {
    settings.value = await battleFrontendSettingsAccess.upsertBattleProfile(
      createDefaultBattleProfile(settings.value.active_api_profile_id),
      {
        makeActive: true,
      },
    );
  };

  const saveBattleProfile = async (profile: BattleProfile, options: { makeActive?: boolean } = {}) => {
    settings.value = await battleFrontendSettingsAccess.upsertBattleProfile(profile, options);
  };

  const removeBattleProfile = async (profileId: string) => {
    settings.value = await battleFrontendSettingsAccess.removeBattleProfile(profileId);
  };

  const setActiveBattleProfile = async (profileId: string | null) => {
    settings.value = await battleFrontendSettingsAccess.setActiveBattleProfile(profileId);
  };

  const resolveBattleApiProfile = (profile: BattleProfile): BattleApiProfile => {
    const targetId = profile.api_profile_id || settings.value.active_api_profile_id;
    const resolved =
      settings.value.api_profiles.find(item => item.id === targetId) ??
      settings.value.api_profiles.find(item => item.id === settings.value.active_api_profile_id) ??
      settings.value.api_profiles[0];

    if (!resolved) {
      throw new Error('当前没有可用的 API 配置');
    }

    return resolved;
  };

  const discoverApiModels = async (profile: BattleApiProfile) =>
    runApiAction(async () => {
      const result = await fetchBattleApiModels(profile);
      discoveredModels.value = {
        ...discoveredModels.value,
        [profile.id]: result.models,
      };
      lastApiMessage.value = result.models.length
        ? `已拉取 ${result.models.length} 个模型`
        : '模型列表请求成功，但未解析到模型 id';
      return result.models;
    });

  const testApiProfile = async (profile: BattleApiProfile) =>
    runApiAction(async () => {
      const testResult = await testBattleApiConnection(profile);
      settings.value = await battleFrontendSettingsAccess.upsertApiProfile(
        {
          ...profile,
          last_test_result: testResult,
        },
        { makeActive: settings.value.active_api_profile_id === profile.id },
      );
      if (testResult.ok) {
        lastApiMessage.value = testResult.message;
      } else {
        lastApiError.value = testResult.message;
      }
      return testResult;
    });

  const runBattleFieldAnalysis = async (profile: BattleProfile) =>
    runFieldAnalysisAction(async () => {
      const apiProfile = resolveBattleApiProfile(profile);
      const analysis = await analyzeBattleFields(apiProfile, profile, mainState.value as Record<string, unknown>);
      lastFieldAnalysisPayload.value = analysis.payload;
      lastFieldAnalysisResult.value = analysis.result;
      settings.value = await battleFrontendSettingsAccess.upsertBattleProfile(
        {
          ...profile,
          field_selection: analysis.fieldSelection,
        },
        { makeActive: settings.value.active_battle_profile_id === profile.id },
      );
      lastFieldAnalysisMessage.value = analysis.result.fields.length
        ? `字段分析完成，已生成 ${analysis.result.fields.length} 条建议`
        : '字段分析完成，但 AI 没有返回有效字段建议';
      return analysis.result;
    });

  const createRuntimeRequestOptions = (
    profile: BattleProfile,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ): BattleRuntimeRequestOptions => ({
    ...options,
    worldbookContext: profile.context.include_worldbook_context ? [] : [],
    environmentContext: profile.context.include_environment_context ? klona(mainState.value.世界 as Record<string, unknown>) : {},
  });

  const sendSingleRoundRequest = async (
    profile: BattleProfile,
    selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const apiProfile = resolveBattleApiProfile(profile);
      const execution = await requestBattleSingleRound(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      lastRuntimePayload.value = execution.payload;
      lastRuntimeResult.value = execution.result;
      lastRuntimeRequestMessage.value = '单回合请求已完成';
      return execution.result;
    });

  const sendFullBattleRequest = async (
    profile: BattleProfile,
    selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const apiProfile = resolveBattleApiProfile(profile);
      const execution = await requestBattleFullBattle(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      lastRuntimePayload.value = execution.payload;
      lastRuntimeResult.value = execution.result;
      lastRuntimeRequestMessage.value = '快速整场请求已完成';
      return execution.result;
    });

  const sendLootResolutionRequest = async (
    profile: BattleProfile,
    selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const apiProfile = resolveBattleApiProfile(profile);
      const execution = await requestBattleLootResolution(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      lastRuntimePayload.value = execution.payload;
      lastRuntimeResult.value = execution.result;
      lastRuntimeRequestMessage.value = '战利品结算请求已完成';
      return execution.result;
    });

  const startBattle = () => runAndRefresh(() => battleSessionController.startBattle(sourceMessageId.value));
  const resumeOrRebuild = () => runAndRefresh(() => battleSessionController.resumeOrRebuild(sourceMessageId.value));
  const forceRebuild = () => runAndRefresh(() => battleSessionController.startBattle(sourceMessageId.value, 'rebuild'));
  const saveStrategy = (text: string) => runAndRefresh(() => battleSessionController.setStrategyText(sourceMessageId.value, text));
  const reroll = () => runAndRefresh(() => battleSessionController.rerollPlayerCheck(sourceMessageId.value));
  const confirm = async () => {
    isResolving.value = true;
    lastResolveError.value = '';
    try {
      return await runAndRefresh(() => battleSessionController.confirmPlayerCheck(sourceMessageId.value));
    } catch (error) {
      lastResolveError.value = error instanceof Error ? error.message : String(error);
      refresh();
      throw error;
    } finally {
      isResolving.value = false;
    }
  };
  const resolveAgain = async () => {
    isResolving.value = true;
    lastResolveError.value = '';
    try {
      return await runAndRefresh(() => battleSessionController.resolveConfirmedRound(sourceMessageId.value));
    } catch (error) {
      lastResolveError.value = error instanceof Error ? error.message : String(error);
      refresh();
      throw error;
    } finally {
      isResolving.value = false;
    }
  };
  const useMockPreview = async () => {
    lastResolveError.value = '';
    return runAndRefresh(() => battleSessionController.mockPreview(sourceMessageId.value));
  };
  const applyPreview = () => runAndRefresh(() => battleSessionController.applyPendingPreview(sourceMessageId.value));
  const finishBattle = () => runAndRefresh(() => battleSessionController.finishBattle(sourceMessageId.value));
  const setOutputMode = (outputMode: BattleSession['output_mode']) =>
    runAndRefresh(() => battleSessionController.setOutputMode(sourceMessageId.value, outputMode));
  const commitBattle = (payload: { summary?: string; fullLog?: string; outputMode?: BattleSession['output_mode'] }) =>
    runAndRefresh(() =>
      battleSessionController.commitBattle({
        sourceMessageId: sourceMessageId.value,
        ...payload,
      }),
    );
  const abandon = () => runAndRefresh(() => battleSessionController.abandonBattle(sourceMessageId.value));
  const close = () => {
    window.top?.postMessage({ type: 'planeswalker:battle:close' }, '*');
  };

  return {
    mainState,
    battleSession,
    settings,
    apiProfiles,
    activeApiProfile,
    battleProfiles,
    activeBattleProfile,
    discoveredActiveModels,
    enemyCount,
    sourceMessageId,
    canResume,
    roundCheckpointDirty,
    isResolving,
    isApiBusy,
    isFieldAnalysisBusy,
    isRuntimeRequestBusy,
    lastResolveError,
    lastApiMessage,
    lastApiError,
    lastFieldAnalysisMessage,
    lastFieldAnalysisError,
    lastFieldAnalysisPayload,
    lastFieldAnalysisResult,
    lastRuntimeRequestMessage,
    lastRuntimeRequestError,
    lastRuntimePayload,
    lastRuntimeResult,
    refresh,
    refreshSettings,
    createApiProfile,
    saveApiProfile,
    removeApiProfile,
    setActiveApiProfile,
    createBattleProfile,
    saveBattleProfile,
    removeBattleProfile,
    setActiveBattleProfile,
    discoverApiModels,
    testApiProfile,
    runBattleFieldAnalysis,
    sendSingleRoundRequest,
    sendFullBattleRequest,
    sendLootResolutionRequest,
    startBattle,
    resumeOrRebuild,
    forceRebuild,
    saveStrategy,
    reroll,
    confirm,
    resolveAgain,
    useMockPreview,
    applyPreview,
    finishBattle,
    setOutputMode,
    commitBattle,
    abandon,
    close,
  };
});
