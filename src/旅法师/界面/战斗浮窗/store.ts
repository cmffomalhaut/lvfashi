import { klona } from 'klona';
import { type BattleSession, type MainState, Schema } from '../../schema.ts';
import {
  createMessageVariableOption,
  projectBattleSession,
  projectMainState,
  resolveRuntimeLatestMessageId,
  stateAccess,
} from '../../脚本/MVU/state-access.ts';
import {
  createDefaultBattleApiProfile,
  createDefaultBattleFrontendSettings,
  createDefaultBattleProfile,
  type BattleApiProfile,
  type BattleFieldAnalysisPayload,
  type BattleFieldAnalysisResult,
  type BattleFullResult,
  type BattleImportedWorldbook,
  type BattleLootResult,
  type BattleProfile,
  type BattleRoundResult,
  type BattleFrontendSettings,
} from '../../脚本/战斗/ai-profile.ts';
import { BattleAiParseError } from '../../脚本/战斗/api-client.ts';
import { fetchBattleApiModels, testBattleApiConnection } from '../../脚本/战斗/api-client.ts';
import { analyzeBattleFields } from '../../脚本/战斗/field-analysis.ts';
import { buildBattleFieldAnalysisPayload } from '../../脚本/战斗/field-analysis.ts';
import { applyBattleRuntimeUpdates } from '../../脚本/战斗/battle-updates.ts';
import { extractSelectedBattleData } from '../../脚本/战斗/field-selection.ts';
import { battleFrontendSettingsAccess } from '../../脚本/战斗/frontend-settings.ts';
import {
  buildBattleRuntimePromptSnapshot,
  buildBattleLootPayload,
  buildBattleRuntimePayload,
  requestBattleFullBattle,
  requestBattleLootResolution,
  requestBattleSingleRound,
  type BattleRuntimePromptKind,
  type BattleRuntimePromptSnapshot,
  type BattleRuntimeRequestOptions,
} from '../../脚本/战斗/runtime-ai.ts';
import {
  createPendingPreviewFromFullBattleResult,
  createPendingPreviewFromLootResult,
  createPendingPreviewFromRoundResult,
  projectMainStateFromBattleSession,
} from '../../脚本/战斗/runtime-session.ts';
import { battleSessionController } from '../../脚本/战斗/session.ts';
import {
  createImportedWorldbook,
  listActiveBattleWorldbooks,
  listBattleWorldbookNames,
  loadBattleWorldbookContent,
  serializeImportedWorldbooks,
  upsertImportedWorldbooks,
} from '../../脚本/战斗/worldbook.ts';

function resolveLatestMessageId(): number {
  const hosts = [window, window.parent, window.top].filter((host): host is Window => Boolean(host));
  for (const host of hosts) {
    try {
      const runtimeHost = host as Window & {
        getCurrentMessageId?: () => number | string | undefined;
        getLastMessageId?: () => number | string | undefined;
      };
      const value = runtimeHost.getCurrentMessageId?.() ?? runtimeHost.getLastMessageId?.();
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch {}
  }
  return resolveRuntimeLatestMessageId() ?? -1;
}

type BattleWindowControlHost = Window & {
  __planeswalkerBattleWindowClose?: () => void;
};

type VariableReaderHost = Window & {
  TavernHelper?: {
    getVariables?: (option: VariableOption) => Record<string, any>;
  };
  getVariables?: (option: VariableOption) => Record<string, any>;
};

function notifyBattleWindowClose(host: Window) {
  try {
    (host as BattleWindowControlHost).__planeswalkerBattleWindowClose?.();
  } catch {
    // Cross-frame hosts may reject direct property access; postMessage remains the fallback.
  }
  try {
    host.postMessage({ type: 'planeswalker:battle:close' }, '*');
  } catch {
    // Detached or restricted frame targets can reject postMessage.
  }
}

export const useBattleWindowStore = defineStore('planeswalker.battle-window', () => {
  const canonicalState = shallowRef(Schema.parse({}, { reportInput: true }));
  const mainState = ref<MainState>(projectMainState(canonicalState.value));
  const battleSession = ref<BattleSession>(projectBattleSession(canonicalState.value));
  const rawMainState = ref<Record<string, unknown>>({});
  const settings = ref<BattleFrontendSettings>(createDefaultBattleFrontendSettings());
  const discoveredModels = ref<Record<string, string[]>>({});
  const isResolving = ref(false);
  const isApiBusy = ref(false);
  const isFieldAnalysisBusy = ref(false);
  const isRuntimeRequestBusy = ref(false);
  const isWorldbookBusy = ref(false);
  const lastResolveError = ref('');
  const lastApiMessage = ref('');
  const lastApiError = ref('');
  const worldbookNames = ref<string[]>([]);
  const lastWorldbookMessage = ref('');
  const lastWorldbookError = ref('');
  const lastFieldAnalysisMessage = ref('');
  const lastFieldAnalysisError = ref('');
  const lastFieldAnalysisPayload = ref<BattleFieldAnalysisPayload | null>(null);
  const lastFieldAnalysisResult = ref<BattleFieldAnalysisResult | null>(null);
  const lastFieldAnalysisRawText = ref('');
  const lastRuntimeRequestMessage = ref('');
  const lastRuntimeRequestError = ref('');
  const lastRuntimePayload = ref<Record<string, unknown> | null>(null);
  const lastRuntimePrompt = ref<BattleRuntimePromptSnapshot | null>(null);
  const lastRuntimeResult = ref<BattleRoundResult | BattleFullResult | BattleLootResult | null>(null);
  const lastRuntimeRawText = ref('');
  const boundSourceMessageId = ref<number | null>(null);
  let retryLastFieldAnalysisAction: null | (() => Promise<unknown>) = null;
  let retryLastRuntimeAction: null | (() => Promise<unknown>) = null;

  const readRawMainState = (messageId: number) => {
    if (messageId < 0) {
      return {};
    }

    const option = createMessageVariableOption(messageId);
    const hosts = [window, window.parent, window.top].filter((host): host is Window => Boolean(host));
    for (const host of hosts) {
      try {
        const readerHost = host as VariableReaderHost;
        const readVariables = readerHost.TavernHelper?.getVariables ?? readerHost.getVariables;
        const variables = readVariables?.(option);
        const statData = _.get(variables, 'stat_data', {});
        if (!_.isEmpty(statData)) {
          return klona(_.omit(statData, 'battle_session')) as Record<string, unknown>;
        }
      } catch {}
    }
    return {};
  };

  const applyCanonicalState = (next: ReturnType<typeof Schema.parse>) => {
    canonicalState.value = next;
    mainState.value = klona(projectMainState(next));
    battleSession.value = klona(projectBattleSession(next));
  };

  const refresh = () => {
    const targetMessageId = boundSourceMessageId.value ?? resolveLatestMessageId() ?? -1;
    try {
      const next =
        targetMessageId >= 0
          ? stateAccess.readCanonicalState(createMessageVariableOption(targetMessageId))
          : Schema.parse({}, { reportInput: true });
      applyCanonicalState(next);
      const session = projectBattleSession(next);
      boundSourceMessageId.value = session.激活 ? session.meta.source_message_id : null;
    } catch (error) {
      lastResolveError.value = error instanceof Error ? error.message : String(error);
      applyCanonicalState(Schema.parse({}, { reportInput: true }));
      boundSourceMessageId.value = null;
    }
    rawMainState.value = readRawMainState(boundSourceMessageId.value ?? targetMessageId);
  };

  const refreshSettings = async () => {
    try {
      settings.value = battleFrontendSettingsAccess.read();
    } catch (error) {
      lastApiError.value = error instanceof Error ? error.message : String(error);
      settings.value = createDefaultBattleFrontendSettings();
    }
  };

  const reloadSettingsFromStorage = () => {
    settings.value = battleFrontendSettingsAccess.read();
    return settings.value;
  };

  const commitSettingsChange = async (action: () => Promise<BattleFrontendSettings>) => await action();

  refresh();
  useIntervalFn(refresh, 1000);
  void refreshSettings();

  const runtimeMainState = computed<MainState>(() =>
    battleSession.value.激活 ? projectMainStateFromBattleSession(battleSession.value) : mainState.value,
  );
  const runtimeStatData = computed<Record<string, unknown>>(() => {
    if (!battleSession.value.激活) {
      return rawMainState.value;
    }
    const baseState = _.isEmpty(rawMainState.value)
      ? (klona(projectMainStateFromBattleSession(battleSession.value)) as Record<string, unknown>)
      : rawMainState.value;
    if (_.isEmpty(battleSession.value.runtime.accumulated_updates)) {
      return baseState;
    }
    return applyBattleRuntimeUpdates(baseState, battleSession.value.runtime.accumulated_updates);
  });
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
  const sourceMessageId = computed(() => boundSourceMessageId.value ?? resolveLatestMessageId() ?? -1);
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

  const assertTransactionSucceeded = (result: unknown) => {
    if (!_.isPlainObject(result)) {
      return;
    }

    const directOk = _.get(result, 'ok');
    if (directOk === false) {
      throw new Error(String(_.get(result, 'message') || '战斗事务执行失败'));
    }

    const nestedTransaction = _.get(result, 'transaction');
    if (_.isPlainObject(nestedTransaction) && _.get(nestedTransaction, 'ok') === false) {
      throw new Error(String(_.get(nestedTransaction, 'message') || '战斗事务执行失败'));
    }
  };

  const applyTransactionResult = (result: unknown) => {
    const after = _.get(result, 'after') ?? _.get(result, 'transaction.after');
    if (after && _.isPlainObject(after)) {
      try {
        const next = Schema.parse(after, { reportInput: true });
        applyCanonicalState(next);
        const session = projectBattleSession(next);
        boundSourceMessageId.value = session.激活 ? session.meta.source_message_id : null;
        rawMainState.value = readRawMainState(boundSourceMessageId.value ?? resolveLatestMessageId() ?? -1);
        return;
      } catch {}
    }
    refresh();
  };

  const runAndRefresh = async <T>(action: () => Promise<T>) => {
    const result = await action();
    applyTransactionResult(result);
    assertTransactionSucceeded(result);
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
    lastFieldAnalysisRawText.value = '';
    lastFieldAnalysisResult.value = null;

    try {
      return await action();
    } catch (error) {
      if (error instanceof BattleAiParseError) {
        lastFieldAnalysisRawText.value = error.rawText;
        lastFieldAnalysisPayload.value = error.payload as BattleFieldAnalysisPayload | null;
      }
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
    lastRuntimeRawText.value = '';
    lastRuntimePrompt.value = null;
    lastRuntimeResult.value = null;

    try {
      return await action();
    } catch (error) {
      if (error instanceof BattleAiParseError) {
        lastRuntimeRawText.value = error.rawText;
        lastRuntimePayload.value = error.payload;
      }
      lastRuntimeRequestError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isRuntimeRequestBusy.value = false;
    }
  };

  const createApiProfile = async () => {
    settings.value = await commitSettingsChange(() =>
      battleFrontendSettingsAccess.upsertApiProfile(createDefaultBattleApiProfile(), {
        makeActive: true,
      }),
    );
  };

  const saveApiProfile = async (profile: BattleApiProfile, options: { makeActive?: boolean } = {}) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.upsertApiProfile(profile, options));
    lastApiMessage.value = '接口配置已保存';
    lastApiError.value = '';
  };

  const removeApiProfile = async (profileId: string) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.removeApiProfile(profileId));
    delete discoveredModels.value[profileId];
  };

  const setActiveApiProfile = async (profileId: string | null) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.setActiveApiProfile(profileId));
  };

  const createBattleProfile = async () => {
    settings.value = await commitSettingsChange(() =>
      battleFrontendSettingsAccess.upsertBattleProfile(createDefaultBattleProfile(settings.value.active_api_profile_id), {
        makeActive: true,
      }),
    );
  };

  const saveBattleProfile = async (profile: BattleProfile, options: { makeActive?: boolean } = {}) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.upsertBattleProfile(profile, options));
  };

  const removeBattleProfile = async (profileId: string) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.removeBattleProfile(profileId));
  };

  const setActiveBattleProfile = async (profileId: string | null) => {
    settings.value = await commitSettingsChange(() => battleFrontendSettingsAccess.setActiveBattleProfile(profileId));
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
      settings.value = await commitSettingsChange(() =>
        battleFrontendSettingsAccess.upsertApiProfile(
          {
            ...profile,
            last_test_result: testResult,
          },
          { makeActive: settings.value.active_api_profile_id === profile.id },
        ),
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
      if (Object.keys(rawMainState.value).length <= 0) {
        throw new Error('当前楼层没有可读取的 stat_data，无法进行字段分析');
      }
      const profileSnapshot = klona(profile);
      retryLastFieldAnalysisAction = () => runBattleFieldAnalysis(profileSnapshot);
      const apiProfile = resolveBattleApiProfile(profile);
      lastFieldAnalysisPayload.value = buildBattleFieldAnalysisPayload(profile, rawMainState.value);
      const analysis = await analyzeBattleFields(apiProfile, profile, rawMainState.value);
      lastFieldAnalysisPayload.value = analysis.payload;
      lastFieldAnalysisResult.value = analysis.result;
      lastFieldAnalysisRawText.value = analysis.rawText;
      settings.value = await commitSettingsChange(() =>
        battleFrontendSettingsAccess.upsertBattleProfile(
          {
            ...profile,
            field_selection: {
              ...profile.field_selection,
              selected_fields: analysis.fieldSelection.selected_fields,
              analysis_warnings: analysis.fieldSelection.analysis_warnings,
              last_analysis_input_hash: analysis.fieldSelection.last_analysis_input_hash,
              last_analysis_at: analysis.fieldSelection.last_analysis_at,
              source_data_hash: analysis.fieldSelection.source_data_hash,
              manual_review_required: true,
            },
          },
          { makeActive: settings.value.active_battle_profile_id === profile.id },
        ),
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
    worldbookContext: profile.context.include_worldbook_context
      ? serializeImportedWorldbooks(profile.context.imported_worldbooks, profile.context.worldbook_max_chars)
      : [],
    environmentContext: profile.context.include_environment_context
      ? klona(runtimeMainState.value.世界 as Record<string, unknown>)
      : {},
    extraInstructions: [profile.context.extra_context_text.trim(), options.extraInstructions?.trim() ?? '']
      .filter(Boolean)
      .join('\n\n'),
  });

  const runWorldbookAction = async <T>(action: () => Promise<T>) => {
    isWorldbookBusy.value = true;
    lastWorldbookMessage.value = '';
    lastWorldbookError.value = '';
    try {
      return await action();
    } catch (error) {
      lastWorldbookError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isWorldbookBusy.value = false;
    }
  };

  const saveBattleProfileWorldbooks = async (profile: BattleProfile, importedWorldbooks: BattleImportedWorldbook[]) => {
    const nextProfile = {
      ...profile,
      context: {
        ...profile.context,
        imported_worldbooks: importedWorldbooks,
      },
    };
    await saveBattleProfile(nextProfile, { makeActive: true });
    return nextProfile;
  };

  const refreshWorldbookNames = async () =>
    runWorldbookAction(async () => {
      worldbookNames.value = await listBattleWorldbookNames();
      lastWorldbookMessage.value = worldbookNames.value.length
        ? `已读取 ${worldbookNames.value.length} 本世界书`
        : '未读取到可选世界书';
      return worldbookNames.value;
    });

  const importActiveWorldbooks = async (profile: BattleProfile) =>
    runWorldbookAction(async () => {
      const activeWorldbooks = await listActiveBattleWorldbooks();
      const imported = activeWorldbooks.map(worldbook => createImportedWorldbook(worldbook));
      const merged = upsertImportedWorldbooks(profile.context.imported_worldbooks, imported, { replaceAutoSources: true });
      await saveBattleProfileWorldbooks(profile, merged);
      lastWorldbookMessage.value = imported.length
        ? `已自动导入 ${imported.length} 本角色/全局世界书`
        : '未检测到角色绑定或全局启用世界书';
      return merged;
    });

  const importWorldbookByName = async (profile: BattleProfile, worldbookName: string) =>
    runWorldbookAction(async () => {
      const name = worldbookName.trim();
      if (!name) {
        throw new Error('请选择世界书');
      }
      const loaded = await loadBattleWorldbookContent(name, 'manual');
      if (!loaded) {
        throw new Error(`世界书“${name}”没有可导入的启用条目`);
      }
      const imported = createImportedWorldbook(loaded, 'manual');
      const merged = upsertImportedWorldbooks(profile.context.imported_worldbooks, [imported]);
      await saveBattleProfileWorldbooks(profile, merged);
      lastWorldbookMessage.value = `已导入世界书“${name}”`;
      return merged;
    });

  const toggleImportedWorldbook = async (profile: BattleProfile, worldbookId: string, enabled: boolean) =>
    runWorldbookAction(async () => {
      const imported = profile.context.imported_worldbooks.map(worldbook =>
        worldbook.id === worldbookId ? { ...worldbook, enabled } : worldbook,
      );
      await saveBattleProfileWorldbooks(profile, imported);
      lastWorldbookMessage.value = enabled ? '世界书已启用' : '世界书已停用';
      return imported;
    });

  const removeImportedWorldbook = async (profile: BattleProfile, worldbookId: string) =>
    runWorldbookAction(async () => {
      const imported = profile.context.imported_worldbooks.filter(worldbook => worldbook.id !== worldbookId);
      await saveBattleProfileWorldbooks(profile, imported);
      lastWorldbookMessage.value = '世界书已删除';
      return imported;
    });

  const createSelectedRuntimeData = (profile: BattleProfile): Record<string, unknown> => {
    if (_.isEmpty(runtimeStatData.value)) {
      return {};
    }
    return extractSelectedBattleData(runtimeStatData.value, profile.field_selection.selected_fields).selectedData;
  };

  const rememberRuntimeRequest = (
    profile: BattleProfile,
    kind: BattleRuntimePromptKind,
    payload: Record<string, unknown>,
  ) => {
    lastRuntimePayload.value = payload;
    lastRuntimePrompt.value = buildBattleRuntimePromptSnapshot(profile, kind, payload);
  };

  const rememberRuntimeExecution = (execution: {
    payload: Record<string, unknown>;
    prompt: BattleRuntimePromptSnapshot;
    result: BattleRoundResult | BattleFullResult | BattleLootResult;
    rawText: string;
  }) => {
    lastRuntimePayload.value = execution.payload;
    lastRuntimePrompt.value = execution.prompt;
    lastRuntimeResult.value = execution.result;
    lastRuntimeRawText.value = execution.rawText;
  };

  const createBattleSessionRuntimeOptions = (profile: BattleProfile): BattleRuntimeRequestOptions => {
    if (!battleSession.value.激活) {
      throw new Error('battle_session is not active');
    }

    const session = battleSession.value;
    const diceInputs =
      profile.run_mode === 'freeform'
        ? {}
        : {
            player_roll: session.player_check.roll,
            reroll_used: session.player_check.reroll_used,
            dark_pool_remaining: klona(session.shared_dark_pool.values.slice(session.shared_dark_pool.cursor)),
            dark_pool_cursor: session.shared_dark_pool.cursor,
            round_no: session.round.round_no,
            acting_side: session.round.acting_side,
          };

    const battleHistoryContext = [
      session.runtime.history.length
        ? session.runtime.history.map(h => `第${h.round_no}回合${h.narration ? `叙述：${h.narration}` : h.summary ? `摘要：${h.summary}` : ''}`).join('\n')
        : '',
      session.runtime.latest_battle_report ? `整场战报：${session.runtime.latest_battle_report}` : '',
      _.isEmpty(session.runtime.accumulated_updates)
        ? ''
        : `战斗前端累计更新（只叠加到下一次 selected_data，不直接写 MVU）：${JSON.stringify(session.runtime.accumulated_updates, null, 2)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return createRuntimeRequestOptions(profile, {
      playerCommand: session.player_check.strategy_text,
      diceInputs,
      extraInstructions: battleHistoryContext,
    });
  };

  const sendSingleRoundRequest = async (
    profile: BattleProfile,
    _selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const profileSnapshot = klona(profile);
      const optionsSnapshot = klona(options);
      retryLastRuntimeAction = () => sendSingleRoundRequest(profileSnapshot, {}, optionsSnapshot);
      const apiProfile = resolveBattleApiProfile(profile);
      const selectedData = createSelectedRuntimeData(profile);
      rememberRuntimeRequest(profile, 'single_round', buildBattleRuntimePayload(profile, selectedData, {
        ...createRuntimeRequestOptions(profile, options),
        turnMode: 'round_based',
      }));
      const execution = await requestBattleSingleRound(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      rememberRuntimeExecution(execution);
      lastRuntimeRequestMessage.value = '单回合请求已完成';
      return execution.result;
    });

  const sendFullBattleRequest = async (
    profile: BattleProfile,
    _selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const profileSnapshot = klona(profile);
      const optionsSnapshot = klona(options);
      retryLastRuntimeAction = () => sendFullBattleRequest(profileSnapshot, {}, optionsSnapshot);
      const apiProfile = resolveBattleApiProfile(profile);
      const selectedData = createSelectedRuntimeData(profile);
      rememberRuntimeRequest(profile, 'full_battle', buildBattleRuntimePayload(profile, selectedData, {
        ...createRuntimeRequestOptions(profile, options),
        turnMode: 'full_battle',
      }));
      const execution = await requestBattleFullBattle(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      rememberRuntimeExecution(execution);
      lastRuntimeRequestMessage.value = '快速整场请求已完成';
      return execution.result;
    });

  const sendLootResolutionRequest = async (
    profile: BattleProfile,
    _selectedData: Record<string, unknown>,
    options: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      const profileSnapshot = klona(profile);
      const optionsSnapshot = klona(options);
      retryLastRuntimeAction = () => sendLootResolutionRequest(profileSnapshot, {}, optionsSnapshot);
      const apiProfile = resolveBattleApiProfile(profile);
      const selectedData = createSelectedRuntimeData(profile);
      rememberRuntimeRequest(
        profile,
        'loot_resolution',
        buildBattleLootPayload(profile, selectedData, createRuntimeRequestOptions(profile, options)),
      );
      const execution = await requestBattleLootResolution(
        apiProfile,
        profile,
        selectedData,
        createRuntimeRequestOptions(profile, options),
      );
      rememberRuntimeExecution(execution);
      lastRuntimeRequestMessage.value = '战利品结算请求已完成';
      return execution.result;
    });

  const executeConfiguredBattleTurn = async (
    profile: BattleProfile,
    _selectedData: Record<string, unknown>,
    options?: Pick<BattleRuntimeRequestOptions, 'playerCommand' | 'diceInputs' | 'extraInstructions'>,
  ) =>
    runRuntimeRequestAction(async () => {
      lastResolveError.value = '';
      const apiProfile = resolveBattleApiProfile(profile);
      const selectedData = createSelectedRuntimeData(profile);
      const sessionRuntimeOptions = battleSession.value.激活 ? createBattleSessionRuntimeOptions(profile) : null;
      const runtimeOptions = battleSession.value.激活
        ? {
            ...sessionRuntimeOptions!,
            playerCommand: options?.playerCommand ?? sessionRuntimeOptions!.playerCommand,
            diceInputs: {
              ...sessionRuntimeOptions!.diceInputs,
              ...klona(options?.diceInputs ?? {}),
            },
            extraInstructions: [sessionRuntimeOptions!.extraInstructions, options?.extraInstructions?.trim() ?? '']
              .filter(Boolean)
              .join('\n\n'),
          }
        : createRuntimeRequestOptions(profile, {
            playerCommand: options?.playerCommand ?? '',
            diceInputs: klona(options?.diceInputs ?? {}),
            extraInstructions: [
              options?.extraInstructions?.trim() ?? '',
              '当前为无 battle_session 测试请求，仅用于检查 AI 返回格式。',
            ]
              .filter(Boolean)
              .join('\n\n'),
          });
      const profileSnapshot = klona(profile);
      const optionsSnapshot = options ? klona(options) : undefined;
      retryLastRuntimeAction = () => executeConfiguredBattleTurn(profileSnapshot, {}, optionsSnapshot);

      if (!battleSession.value.激活) {
        if (profile.default_turn_mode === 'full_battle') {
          rememberRuntimeRequest(profile, 'full_battle', buildBattleRuntimePayload(profile, selectedData, {
            ...runtimeOptions,
            turnMode: 'full_battle',
          }));
          const execution = await requestBattleFullBattle(apiProfile, profile, selectedData, runtimeOptions);
          rememberRuntimeExecution(execution);
          lastRuntimeRequestMessage.value = '测试请求已完成，未写入 battle_session';
          return execution.result;
        }

        rememberRuntimeRequest(profile, 'single_round', buildBattleRuntimePayload(profile, selectedData, {
          ...runtimeOptions,
          turnMode: 'round_based',
        }));
        const execution = await requestBattleSingleRound(apiProfile, profile, selectedData, runtimeOptions);
        rememberRuntimeExecution(execution);
        lastRuntimeRequestMessage.value = '测试请求已完成，未写入 battle_session';
        return execution.result;
      }

      if (profile.default_turn_mode === 'full_battle') {
        rememberRuntimeRequest(profile, 'full_battle', buildBattleRuntimePayload(profile, selectedData, {
          ...runtimeOptions,
          turnMode: 'full_battle',
        }));
        const execution = await requestBattleFullBattle(apiProfile, profile, selectedData, runtimeOptions);
        const application = createPendingPreviewFromFullBattleResult(battleSession.value, execution.result);
        rememberRuntimeExecution(execution);
        const fullApply = await battleSessionController.applyRuntimeFullBattleResult(sourceMessageId.value, {
          preview: application.preview,
          accumulatedUpdates: application.accumulatedUpdates,
          latestResult: {
            type: 'full_battle',
            summary: execution.result.rounds.at(-1)?.summary || execution.result.battle_report,
            battleReport: execution.result.battle_report,
            battleEnd: true,
            battleEndReason: execution.result.battle_end_reason,
            warnings: execution.result.warnings,
            settlement: {
              ...execution.result.settlement,
              loot_ready: profile.settlement_mode !== 'no_loot',
              mvu_commit_ready: true,
              loot_context: execution.result.loot_context,
            },
          },
        });
        lastRuntimeRequestMessage.value = '快速整场战斗执行完成';
        applyTransactionResult(fullApply);
        return execution.result;
      }

      rememberRuntimeRequest(profile, 'single_round', buildBattleRuntimePayload(profile, selectedData, {
        ...runtimeOptions,
        turnMode: 'round_based',
      }));
      const execution = await requestBattleSingleRound(apiProfile, profile, selectedData, runtimeOptions);
      const application = createPendingPreviewFromRoundResult(battleSession.value, execution.result);
      rememberRuntimeExecution(execution);
      const roundApply = await battleSessionController.applyRuntimeRoundPreview(sourceMessageId.value, {
        preview: application.preview,
        accumulatedUpdates: application.accumulatedUpdates,
        latestResult: {
          type: 'round',
          summary: execution.result.summary,
          narration: execution.result.narration,
          battleEnd: execution.result.battle_end,
          battleEndReason: execution.result.battle_end_reason,
          statusChanges: execution.result.status_changes,
          resourceChanges: execution.result.resource_changes,
          warnings: execution.result.warnings,
          settlement: execution.result.settlement,
        },
      });
      lastRuntimeRequestMessage.value = execution.result.battle_end ? '单回合执行完成，战斗已结束' : '单回合执行完成';
      applyTransactionResult(roundApply);
      return execution.result;
    });

  const executeConfiguredLootResolution = async (profile: BattleProfile, _selectedData: Record<string, unknown>) =>
    runRuntimeRequestAction(async () => {
      lastResolveError.value = '';
      if (!battleSession.value.激活) {
        throw new Error('请先开始战斗，再处理战利品结算');
      }

      if (profile.settlement_mode === 'no_loot') {
        lastRuntimeRequestMessage.value = '当前结算模式为 no_loot，已跳过战利品流程';
        return null;
      }

      if (battleSession.value.phase !== 'finished') {
        throw new Error('请先让战斗进入 finished，再处理战利品结算');
      }

      const apiProfile = resolveBattleApiProfile(profile);
      const sessionOptions = createBattleSessionRuntimeOptions(profile);
      const selectedData = createSelectedRuntimeData(profile);
      const profileSnapshot = klona(profile);
      retryLastRuntimeAction = () => executeConfiguredLootResolution(profileSnapshot, {});
      const lootExtraInstructions = [
        sessionOptions.extraInstructions,
        battleSession.value.runtime.settlement.check_prompt_needed ? '当前为 checked_loot，请根据额外检定或搜刮说明进行结算。' : '',
        _.isEmpty(battleSession.value.runtime.settlement.loot_context)
          ? ''
          : `settlement_loot_context=\n${JSON.stringify(battleSession.value.runtime.settlement.loot_context, null, 2)}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      rememberRuntimeRequest(profile, 'loot_resolution', buildBattleLootPayload(profile, selectedData, {
        ...sessionOptions,
        extraInstructions: lootExtraInstructions,
      }));
      const execution = await requestBattleLootResolution(apiProfile, profile, selectedData, {
        ...sessionOptions,
        extraInstructions: lootExtraInstructions,
      });
      const application = createPendingPreviewFromLootResult(battleSession.value, execution.result);
      rememberRuntimeExecution(execution);
      const lootApply = await battleSessionController.applyRuntimeLootResult(sourceMessageId.value, {
        preview: application.preview,
        accumulatedUpdates: application.accumulatedUpdates,
        latestResult: {
          type: 'loot',
          summary: execution.result.loot_result.has_loot ? '战利品结算完成' : '战利品结算完成，无额外掉落',
          warnings: execution.result.warnings,
          settlement: {
            ...battleSession.value.runtime.settlement,
            loot_ready: true,
            mvu_commit_ready: true,
            loot_context: execution.result.loot_context,
          },
        },
      });
      lastRuntimeRequestMessage.value =
        profile.settlement_mode === 'checked_loot' ? 'checked_loot 结算已完成' : '战利品结算已完成';
      applyTransactionResult(lootApply);
      return execution.result;
    });

  const retryLastFieldAnalysis = async () => {
    if (!retryLastFieldAnalysisAction) {
      lastFieldAnalysisError.value = '当前没有可重试的字段分析请求';
      throw new Error('当前没有可重试的字段分析请求');
    }
    return retryLastFieldAnalysisAction();
  };

  const retryLastRuntimeRequest = async () => {
    if (!retryLastRuntimeAction) {
      lastRuntimeRequestError.value = '当前没有可重试的正式运行请求';
      throw new Error('当前没有可重试的正式运行请求');
    }
    return retryLastRuntimeAction();
  };

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
  const appendRuntimeChatMessage = (entry: {
    role: BattleSession['runtime']['transcript'][number]['role'];
    content: string;
    label?: string;
  }) => runAndRefresh(() => battleSessionController.appendRuntimeChatMessage(sourceMessageId.value, entry));
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
    const frameElement = window.frameElement as HTMLElement | null;
    if (frameElement) {
      frameElement.style.setProperty('display', 'none', 'important');
      frameElement.setAttribute('aria-hidden', 'true');
    }

    const notifiedHosts = new Set<Window>();
    const candidates: Array<Window | null | undefined> = [window, window.parent, window.top];
    try {
      const top = window.top;
      if (top) {
        for (let i = 0; i < top.frames.length; i++) {
          try { candidates.push(top.frames[i]); } catch {}
        }
      }
    } catch {}

    for (const host of candidates) {
      if (!host || notifiedHosts.has(host)) continue;
      notifiedHosts.add(host);
      notifyBattleWindowClose(host);
    }
  };

  return {
    mainState,
    battleSession,
    runtimeMainState,
    rawMainState,
    runtimeStatData,
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
    isWorldbookBusy,
    lastResolveError,
    lastApiMessage,
    lastApiError,
    worldbookNames,
    lastWorldbookMessage,
    lastWorldbookError,
    lastFieldAnalysisMessage,
    lastFieldAnalysisError,
    lastFieldAnalysisPayload,
    lastFieldAnalysisResult,
    lastFieldAnalysisRawText,
    lastRuntimeRequestMessage,
    lastRuntimeRequestError,
    lastRuntimePayload,
    lastRuntimePrompt,
    lastRuntimeResult,
    lastRuntimeRawText,
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
    refreshWorldbookNames,
    importActiveWorldbooks,
    importWorldbookByName,
    toggleImportedWorldbook,
    removeImportedWorldbook,
    runBattleFieldAnalysis,
    retryLastFieldAnalysis,
    sendSingleRoundRequest,
    sendFullBattleRequest,
    sendLootResolutionRequest,
    executeConfiguredBattleTurn,
    executeConfiguredLootResolution,
    retryLastRuntimeRequest,
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
    appendRuntimeChatMessage,
    setOutputMode,
    commitBattle,
    abandon,
    close,
  };
});
