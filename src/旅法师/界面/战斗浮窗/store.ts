import { klona } from 'klona';
import { defineMvuDataStore } from '@util/mvu';
import { type BattleSession, type MainState, Schema } from '../../schema.ts';
import { projectBattleSession, projectMainState } from '../../???/MVU/state-access.ts';
import { battleSessionController } from '../../???/???/session.ts';

const useCanonicalStore = defineMvuDataStore(Schema, { type: 'message', message_id: 'latest' });

function resolveLatestMessageId(): number {
  return Number(getCurrentMessageId?.() ?? -1);
}

export const useBattleWindowStore = defineStore('planeswalker.battle-window', () => {
  const canonicalStore = useCanonicalStore();
  const isResolving = ref(false);
  const lastResolveError = ref('');

  const mainState = computed<MainState>(() => klona(projectMainState(canonicalStore.data)));
  const battleSession = computed<BattleSession>(() => klona(projectBattleSession(canonicalStore.data)));
  const enemyCount = computed(() => Object.keys(mainState.value.???).length);
  const sourceMessageId = computed(() => resolveLatestMessageId());
  const canResume = computed(
    () => battleSession.value.????&& battleSession.value.meta.source_message_id === sourceMessageId.value,
  );
  const roundCheckpointDirty = computed(
    () =>
      battleSession.value.phase !== battleSession.value.round_checkpoint.phase ||
      !_.isEqual(battleSession.value.player_check, battleSession.value.round_checkpoint.player_check) ||
      !_.isEqual(battleSession.value.shared_dark_pool, battleSession.value.round_checkpoint.shared_dark_pool) ||
      !_.isEqual(battleSession.value.pending_preview, battleSession.value.round_checkpoint.pending_preview) ||
      !_.isEqual(battleSession.value.combatants, battleSession.value.round_checkpoint.combatants),
  );

  const startBattle = () => battleSessionController.startBattle(sourceMessageId.value);
  const resumeOrRebuild = () => battleSessionController.resumeOrRebuild(sourceMessageId.value);
  const forceRebuild = () => battleSessionController.startBattle(sourceMessageId.value, 'rebuild');
  const saveStrategy = (text: string) => battleSessionController.setStrategyText(sourceMessageId.value, text);
  const reroll = () => battleSessionController.rerollPlayerCheck(sourceMessageId.value);
  const confirm = async () => {
    isResolving.value = true;
    lastResolveError.value = '';
    try {
      return await battleSessionController.confirmPlayerCheck(sourceMessageId.value);
    } catch (error) {
      lastResolveError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isResolving.value = false;
    }
  };
  const resolveAgain = async () => {
    isResolving.value = true;
    lastResolveError.value = '';
    try {
      return await battleSessionController.resolveConfirmedRound(sourceMessageId.value);
    } catch (error) {
      lastResolveError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isResolving.value = false;
    }
  };
  const useMockPreview = async () => {
    lastResolveError.value = '';
    return battleSessionController.mockPreview(sourceMessageId.value);
  };
  const applyPreview = () => battleSessionController.applyPendingPreview(sourceMessageId.value);
  const setOutputMode = (outputMode: BattleSession['output_mode']) =>
    battleSessionController.setOutputMode(sourceMessageId.value, outputMode);
  const commitBattle = (payload: { summary?: string; fullLog?: string; outputMode?: BattleSession['output_mode'] }) =>
    battleSessionController.commitBattle({
      sourceMessageId: sourceMessageId.value,
      ...payload,
    });
  const abandon = () => battleSessionController.abandonBattle(sourceMessageId.value);
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
    startBattle,
    resumeOrRebuild,
    forceRebuild,
    saveStrategy,
    reroll,
    confirm,
    resolveAgain,
    useMockPreview,
    applyPreview,
    setOutputMode,
    commitBattle,
    abandon,
    close,
  };
});
