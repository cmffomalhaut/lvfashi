import { klona } from 'klona';
import {
  BattleSessionSchema,
  PendingPreviewSchema,
  PlayerCheckSchema,
  RoundCheckpointSchema,
  type BattleSession,
  type MainState,
} from '../../schema.ts';
import { stateAccess, type StateAccessApi, type StateAccessTransactionResult } from '../MVU/state-access.ts';
import { commitBattleOutcome, type BattleCommitOptions } from './commit.ts';
import { buildBattleRoundPrompt, createPendingPreviewFromPrompt } from './prompt.ts';
import { battleAiResolver, type BattleAiResolver } from './resolve.ts';
import { createPrebattleSnapshot, restorePrebattleSnapshot } from './snapshot.ts';

export type ResumeOrRebuildResult = {
  kind: 'resume' | 'rebuild';
  session: BattleSession;
  transaction: StateAccessTransactionResult | null;
};

const now = () => Date.now();
const rollD20 = () => _.random(1, 20);
const darkPool = () => Array.from({ length: 5 }, () => rollD20());

function createFreshPlayerCheck() {
  return PlayerCheckSchema.parse(
    {
      strategy_text: '',
      roll: rollD20(),
      reroll_used: 0,
      confirmed: false,
    },
    { reportInput: true },
  );
}

function captureRoundCheckpoint(session: BattleSession, phase: BattleSession['phase'] = session.phase) {
  return RoundCheckpointSchema.parse(
    {
      phase,
      round: klona(session.round),
      player_check: klona(session.player_check),
      shared_dark_pool: klona(session.shared_dark_pool),
      combatants: klona(session.combatants),
      pending_preview: klona(session.pending_preview),
    },
    { reportInput: true },
  );
}

function restoreRoundCheckpoint(session: BattleSession) {
  session.phase = session.round_checkpoint.phase;
  session.round = klona(session.round_checkpoint.round);
  session.player_check = klona(session.round_checkpoint.player_check);
  session.shared_dark_pool = klona(session.round_checkpoint.shared_dark_pool);
  session.combatants = klona(session.round_checkpoint.combatants);
  session.pending_preview = klona(session.round_checkpoint.pending_preview);
}

function hasUncommittedRoundState(session: BattleSession) {
  return (
    session.phase !== session.round_checkpoint.phase ||
    !_.isEqual(session.player_check, session.round_checkpoint.player_check) ||
    !_.isEqual(session.shared_dark_pool, session.round_checkpoint.shared_dark_pool) ||
    !_.isEqual(session.pending_preview, session.round_checkpoint.pending_preview) ||
    !_.isEqual(session.combatants, session.round_checkpoint.combatants)
  );
}

function hasResolvedCombatants(session: Pick<BattleSession, 'pending_preview'>) {
  const { allies, enemies } = session.pending_preview.proposed_combatants;
  return Object.keys(allies).length + Object.keys(enemies).length > 0;
}

function buildBattleSession(mainState: MainState, sourceMessageId: number, mode: 'resume' | 'rebuild'): BattleSession {
  const timestamp = now();
  const heroAllyId = mainState.???.??????.id || 'avatar-main';
  const session = BattleSessionSchema.parse(
    {
      ???? true,
      meta: {
        source_message_id: sourceMessageId,
        mode,
        hero_ally_id: heroAllyId,
        created_at: timestamp,
        updated_at: timestamp,
      },
      phase: 'player_input',
      round: {
        round_no: 1,
        acting_side: '?????,
      },
      player_check: createFreshPlayerCheck(),
      shared_dark_pool: {
        values: darkPool(),
        cursor: 0,
      },
      combatants: {
        allies: {
          [heroAllyId]: klona(mainState.???.??????),
          ...klona(mainState.???),
        },
        enemies: klona(mainState.???),
      },
      prebattle_snapshot: createPrebattleSnapshot(mainState, sourceMessageId),
      pending_preview: {},
      round_checkpoint: {},
      output_mode: 'summary_only',
    },
    { reportInput: true },
  );
  session.round_checkpoint = captureRoundCheckpoint(session, 'player_input');
  return session;
}

export function createBattleSessionController(
  access: StateAccessApi = stateAccess,
  resolveBattlePreview: BattleAiResolver = battleAiResolver,
) {
  const startBattle = async (sourceMessageId: number, mode: 'resume' | 'rebuild' = 'resume') =>
    access.editCanonicalState({
      sourceMessageId,
      mutate: draft => {
        const nextSession = buildBattleSession(access.readMainState(), sourceMessageId, mode);
        draft.battle_session = nextSession;
      },
      postCheck: (_before, after) => after.battle_session.meta.source_message_id === sourceMessageId && after.battle_session.????
      postCheckMessage: 'battle_session start post-check failed',
    });

  const resumeOrRebuild = async (sourceMessageId: number): Promise<ResumeOrRebuildResult> => {
    const battleSession = access.readBattleSession();
    if (battleSession.????&& battleSession.meta.source_message_id === sourceMessageId) {
      if (!hasUncommittedRoundState(battleSession)) {
        return { kind: 'resume', session: battleSession, transaction: null };
      }

      const transaction = await access.editBattleSession({
        sourceMessageId,
        mutate: draft => {
          restoreRoundCheckpoint(draft);
          draft.meta.updated_at = now();
        },
      });
      return {
        kind: 'resume',
        session: access.readBattleSession(),
        transaction,
      };
    }

    const transaction = await startBattle(sourceMessageId, 'rebuild');
    return {
      kind: 'rebuild',
      session: access.readBattleSession(),
      transaction,
    };
  };

  const setStrategyText = (sourceMessageId: number, strategyText: string) =>
    access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        draft.phase = 'player_input';
        draft.player_check.strategy_text = strategyText;
        draft.meta.updated_at = now();
      },
    });

  const rerollPlayerCheck = (sourceMessageId: number) =>
    access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        if (draft.player_check.confirmed || draft.player_check.reroll_used >= 3) {
          return;
        }
        draft.phase = 'player_roll';
        draft.player_check.roll = rollD20();
        draft.player_check.reroll_used += 1;
        draft.meta.updated_at = now();
      },
    });

  const resolveConfirmedRound = async (sourceMessageId: number) => {
    const beforeResolve = await access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        if (!draft.player_check.confirmed) {
          throw new Error('player_check must be confirmed before ai resolve');
        }
        draft.phase = 'ai_resolve';
        draft.pending_preview = PendingPreviewSchema.parse({});
        draft.meta.updated_at = now();
      },
    });
    if (!beforeResolve.ok) {
      return beforeResolve;
    }

    try {
      const preview = await resolveBattlePreview(access.readBattleSession());
      return await access.editBattleSession({
        sourceMessageId,
        mutate: draft => {
          if (!draft.player_check.confirmed) {
            throw new Error('player_check confirmation was cleared before preview writeback');
          }
          if (!hasResolvedCombatants({ pending_preview: preview })) {
            throw new Error('battle preview must include explicit combatants');
          }
          buildBattleRoundPrompt(draft);
          draft.pending_preview = PendingPreviewSchema.parse(preview, { reportInput: true });
          draft.phase = 'preview';
          draft.meta.updated_at = now();
        },
      });
    } catch (error) {
      await access.editBattleSession({
        sourceMessageId,
        mutate: draft => {
          draft.phase = 'player_input';
          draft.pending_preview = PendingPreviewSchema.parse({});
          draft.meta.updated_at = now();
        },
      });
      throw error;
    }
  };

  const confirmPlayerCheck = async (sourceMessageId: number) => {
    const confirmed = await access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        draft.player_check.confirmed = true;
        draft.phase = 'ai_resolve';
        draft.meta.updated_at = now();
      },
    });
    if (!confirmed.ok) {
      return confirmed;
    }
    return resolveConfirmedRound(sourceMessageId);
  };

  const mockPreview = (sourceMessageId: number) =>
    access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        draft.player_check.confirmed = true;
        draft.phase = 'preview';
        buildBattleRoundPrompt(draft);
        draft.pending_preview = createPendingPreviewFromPrompt(draft);
        draft.meta.updated_at = now();
      },
    });

  const applyPendingPreview = (sourceMessageId: number) =>
    access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        if (!draft.???? {
          throw new Error('battle_session is not active');
        }
        if (draft.phase !== 'preview' || !draft.pending_preview.summary) {
          throw new Error('battle_session must have a resolved preview before apply');
        }
        if (!hasResolvedCombatants(draft)) {
          throw new Error('battle_session preview is missing combatants');
        }
        draft.combatants = klona(draft.pending_preview.proposed_combatants);
        draft.phase = 'player_input';
        draft.round.round_no += 1;
        draft.round.acting_side = draft.round.acting_side === '????? ? '???' : '?????;
        draft.player_check = createFreshPlayerCheck();
        draft.shared_dark_pool.values = darkPool();
        draft.shared_dark_pool.cursor = 0;
        draft.pending_preview = PendingPreviewSchema.parse({});
        draft.round_checkpoint = captureRoundCheckpoint(draft, 'player_input');
        draft.meta.updated_at = now();
      },
    });

  const setOutputMode = (sourceMessageId: number, outputMode: BattleSession['output_mode']) =>
    access.editBattleSession({
      sourceMessageId,
      mutate: draft => {
        draft.output_mode = outputMode;
        draft.meta.updated_at = now();
      },
    });

  const commitBattle = (options: BattleCommitOptions) => commitBattleOutcome(access, options);

  const abandonBattle = (sourceMessageId: number) =>
    access.editCanonicalState({
      sourceMessageId,
      mutate: draft => {
        if (!draft.battle_session.???? {
          throw new Error('battle_session is not active');
        }
        const restored = restorePrebattleSnapshot(draft, draft.battle_session.prebattle_snapshot);
        Object.assign(draft, restored, {
          battle_session: BattleSessionSchema.parse({}, { reportInput: true }),
        });
      },
      postCheck: (_before, after) => after.battle_session.????=== false,
      postCheckMessage: 'battle_session was not cleared after abandon',
    });

  return {
    startBattle,
    resumeOrRebuild,
    setStrategyText,
    rerollPlayerCheck,
    confirmPlayerCheck,
    resolveConfirmedRound,
    mockPreview,
    applyPendingPreview,
    setOutputMode,
    commitBattle,
    abandonBattle,
  };
}

export const battleSessionController = createBattleSessionController();
