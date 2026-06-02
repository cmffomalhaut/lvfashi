import { klona } from 'klona';
import { BattleSessionSchema, type BattleSession } from '../../schema.ts';
import { stateAccess, type StateAccessApi, type StateAccessTransactionResult } from '../MVU/state-access.ts';
import { applyBattleRuntimeUpdates } from './battle-updates.ts';

export type BattleCommitOptions = {
  sourceMessageId: number;
  summary?: string;
  fullLog?: string;
  outputMode?: BattleSession['output_mode'];
};

function resolveHeroUnit(session: BattleSession) {
  const heroId = session.prebattle_snapshot.主角.当前化身.id;
  const heroAllyId = session.meta.hero_ally_id || heroId;
  const allies = klona(session.combatants.allies);
  const hero = (heroAllyId && allies[heroAllyId]) || session.prebattle_snapshot.主角.当前化身;

  if (heroAllyId && allies[heroAllyId]) {
    delete allies[heroAllyId];
  }

  return {
    hero: klona(hero),
    team: allies,
  };
}

function mergeLoot(
  backpack: Record<string, BattleSession['pending_preview']['proposed_loot'][string]>,
  loot: Record<string, BattleSession['pending_preview']['proposed_loot'][string]>,
) {
  const nextBackpack = klona(backpack);

  for (const [id, item] of Object.entries(loot)) {
    const existing = nextBackpack[id];
    if (!existing) {
      nextBackpack[id] = klona(item);
      continue;
    }
    nextBackpack[id] = {
      ...existing,
      ...klona(item),
      数量: Math.max(existing.数量, 0) + Math.max(item.数量, 0),
    };
  }

  return nextBackpack;
}

function nextRecordKey(record: Record<string, string>, prefix: string) {
  if (!record[prefix]) {
    return prefix;
  }

  let index = 2;
  while (record[`${prefix}_${index}`]) {
    index += 1;
  }

  return `${prefix}_${index}`;
}

function buildRecentEvents(session: BattleSession, narrative: string) {
  const baseKey = `battle_${session.meta.created_at || Date.now()}`;
  const events: Record<string, string> = {};

  for (const [key, value] of Object.entries(session.pending_preview.proposed_world_events)) {
    events[`${baseKey}_${key}`] = value;
  }

  events[baseKey] = narrative.trim() || session.pending_preview.summary || `战斗结束（第${session.round.round_no}回合）`;
  return events;
}

export async function commitBattleOutcome(
  access: StateAccessApi = stateAccess,
  { sourceMessageId, summary = '', fullLog = '', outputMode }: BattleCommitOptions,
): Promise<StateAccessTransactionResult> {
  return access.editCanonicalState({
    sourceMessageId,
    mutate: draft => {
      const session = draft.battle_session;
      if (!session.激活) {
        throw new Error('battle_session is not active');
      }
      if (session.phase !== 'finished') {
        throw new Error('battle_session must be in finished phase before terminal commit');
      }

      const resolvedOutputMode = outputMode ?? session.output_mode;
      const narrative = resolvedOutputMode === 'full_log' ? fullLog || summary : summary || fullLog;
      const { hero, team } = resolveHeroUnit(session);
      const runtimePatchedDraft = applyBattleRuntimeUpdates(draft, session.runtime.accumulated_updates);

      draft.主角 = runtimePatchedDraft.主角;
      draft.队伍 = runtimePatchedDraft.队伍;
      draft.敌方 = runtimePatchedDraft.敌方;
      draft.背包 = runtimePatchedDraft.背包;
      draft.世界 = runtimePatchedDraft.世界;
      draft.任务 = runtimePatchedDraft.任务;
      draft.当前可见卡 = runtimePatchedDraft.当前可见卡;

      draft.主角.当前化身 = hero;
      draft.队伍 = team;
      draft.敌方 = {};
      draft.背包 = mergeLoot(draft.背包, session.pending_preview.proposed_loot);

      const recentEvents = klona(draft.世界.近期事务);
      for (const [key, value] of Object.entries(buildRecentEvents(session, narrative))) {
        recentEvents[nextRecordKey(recentEvents, key)] = value;
      }
      draft.世界.近期事务 = recentEvents;
      draft.battle_session = BattleSessionSchema.parse({}, { reportInput: true });
    },
    postCheck: (_before, after) => after.battle_session.激活 === false && Object.keys(after.敌方).length === 0,
    postCheckMessage: 'battle terminal commit post-check failed',
  });
}
