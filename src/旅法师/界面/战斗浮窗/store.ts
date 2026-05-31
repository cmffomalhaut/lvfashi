import { klona } from 'klona';
import { type BattleSession, type MainState, Schema } from '../../schema.ts';
import { projectBattleSession, projectMainState, stateAccess } from '../../脚本/MVU/state-access.ts';
import { battleSessionController } from '../../脚本/战斗/session.ts';

function resolveLatestMessageId(): number {
  return Number(getCurrentMessageId?.() ?? -1);
}

export const useBattleWindowStore = defineStore('planeswalker.battle-window', () => {
  const canonicalState = ref(Schema.parse({}, { reportInput: true }));
  const isResolving = ref(false);
  const lastResolveError = ref('');

  const refresh = () => {
    canonicalState.value = stateAccess.readCanonicalState();
  };

  refresh();
  useIntervalFn(refresh, 1000);

  const mainState = computed<MainState>(() => klona(projectMainState(canonicalState.value)));
  const battleSession = computed<BattleSession>(() => klona(projectBattleSession(canonicalState.value)));
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
    enemyCount,
    sourceMessageId,
    canResume,
    roundCheckpointDirty,
    isResolving,
    lastResolveError,
    refresh,
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