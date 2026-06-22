import { klona } from 'klona';
import type { BattleFullResult, BattleLootItem, BattleLootResult, BattleRoundResult } from './ai-profile.ts';
import { applyBattleRuntimeUpdates, mergeBattleRuntimeUpdates } from './battle-updates.ts';
import {
  MainStateSchema,
  PendingPreviewSchema,
  type BattleSession,
  type MainState,
} from '../../schema.ts';

function sanitizeKeySegment(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/\s+/gu, '_').replace(/[^\p{L}\p{N}_-]/gu, '');
  return sanitized || fallback;
}

export function projectMainStateFromBattleSession(session: BattleSession): MainState {
  return MainStateSchema.parse(
    {
      世界: klona(session.prebattle_snapshot.世界),
      主角: klona(session.prebattle_snapshot.主角),
      队伍: klona(session.combatants.allies),
      敌方: klona(session.combatants.enemies),
      背包: klona(session.prebattle_snapshot.背包),
      任务: klona(session.prebattle_snapshot.任务),
      当前可见卡: klona(session.prebattle_snapshot.当前可见卡),
    },
    { reportInput: true },
  );
}

function buildCombatantsFromMainState(mainState: MainState) {
  return {
    allies: klona(mainState.队伍),
    enemies: klona(mainState.敌方),
  };
}

function buildRoundWorldEvents(session: BattleSession, result: BattleRoundResult) {
  const baseKey = `battle_round_${session.round.round_no}`;
  const events: Record<string, string> = {
    [baseKey]: result.summary || `第${session.round.round_no}回合结算完成`,
  };

  result.status_changes.forEach((change, index) => {
    events[`${baseKey}_status_${index + 1}`] = change;
  });
  result.resource_changes.forEach((change, index) => {
    events[`${baseKey}_resource_${index + 1}`] = change;
  });

  return events;
}

function buildFullBattleWorldEvents(session: BattleSession, result: BattleFullResult) {
  const baseKey = `battle_full_${session.meta.created_at || Date.now()}`;
  const events: Record<string, string> = {
    [baseKey]: result.battle_report || result.battle_end_reason || '整场战斗已结束',
  };

  result.rounds.forEach(round => {
    events[`${baseKey}_round_${round.round_index}`] = round.summary || round.narration || `第${round.round_index}回合`;
  });
  result.loot_result.special_findings.forEach((finding, index) => {
    events[`${baseKey}_loot_finding_${index + 1}`] = `${finding.name || `发现 ${index + 1}`}：${finding.description || finding.reason || '无补充说明'}`;
  });

  return events;
}

function createLootRecord(item: BattleLootItem, index: number) {
  const key = sanitizeKeySegment(item.name, `loot_${index + 1}`);
  return [
    key,
    {
      id: key,
      名称: item.name || `未命名战利品 ${index + 1}`,
      数量: Math.max(1, Math.round(item.quantity || 1)),
      标签: ['战利品'],
      描述: item.description || item.reason || '',
      效果: item.reason || '',
    },
  ] as const;
}

function isMeaningfulLootItem(item: BattleLootItem) {
  return Boolean(item.name.trim() || item.description.trim() || item.reason.trim() || item.quantity > 0);
}

function createLootRecordsFromUpdates(updates: Record<string, unknown>) {
  return Object.entries(updates).map(([name, value], index) => {
    const key = sanitizeKeySegment(name, `loot_update_${index + 1}`);
    return [
      key,
      {
        id: key,
        名称: name,
        数量: typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(Math.abs(value))) : 1,
        标签: ['战利品'],
        描述: typeof value === 'string' ? value : JSON.stringify(value),
        效果: typeof value === 'number' ? `${value >= 0 ? '+' : ''}${value}` : '',
      },
    ] as const;
  });
}

export function buildRuntimeMainState(
  session: BattleSession,
  accumulatedUpdates: Record<string, unknown> = session.runtime.accumulated_updates,
): MainState {
  const baseState = projectMainStateFromBattleSession(session);
  if (_.isEmpty(accumulatedUpdates)) {
    return baseState;
  }

  try {
    return MainStateSchema.parse(applyBattleRuntimeUpdates(baseState, accumulatedUpdates), { reportInput: true });
  } catch {
    return baseState;
  }
}

export function createPendingPreviewFromRoundResult(session: BattleSession, result: BattleRoundResult) {
  const accumulatedUpdates = mergeBattleRuntimeUpdates(session.runtime.accumulated_updates, result.selected_data_updates);
  const nextMainState = buildRuntimeMainState(session, accumulatedUpdates);

  return {
    preview: PendingPreviewSchema.parse(
      {
        summary: result.summary,
        proposed_world_events: buildRoundWorldEvents(session, result),
        proposed_combatants: buildCombatantsFromMainState(nextMainState),
        proposed_loot: {},
      },
      { reportInput: true },
    ),
    accumulatedUpdates,
  };
}

export function createPendingPreviewFromFullBattleResult(session: BattleSession, result: BattleFullResult) {
  const battleUpdates = mergeBattleRuntimeUpdates(session.runtime.accumulated_updates, result.final_selected_data_updates);
  const accumulatedUpdates = mergeBattleRuntimeUpdates(battleUpdates, result.loot_mvu_updates);
  const nextMainState = buildRuntimeMainState(session, accumulatedUpdates);
  const itemLoot = result.loot_result.loot_items.filter(isMeaningfulLootItem).map(createLootRecord);
  const nextLoot = Object.fromEntries(itemLoot.length ? itemLoot : createLootRecordsFromUpdates(result.loot_mvu_updates));

  return {
    preview: PendingPreviewSchema.parse(
      {
        summary: result.battle_report || result.battle_end_reason || '整场战斗已结束',
        proposed_world_events: buildFullBattleWorldEvents(session, result),
        proposed_combatants: buildCombatantsFromMainState(nextMainState),
        proposed_loot: nextLoot,
      },
      { reportInput: true },
    ),
    accumulatedUpdates,
  };
}

export function createPendingPreviewFromLootResult(session: BattleSession, result: BattleLootResult) {
  const accumulatedUpdates = mergeBattleRuntimeUpdates(session.runtime.accumulated_updates, result.mvu_updates);
  const nextMainState = buildRuntimeMainState(session, accumulatedUpdates);
  const itemLoot = result.loot_result.loot_items.filter(isMeaningfulLootItem).map(createLootRecord);
  const nextLoot = Object.fromEntries(itemLoot.length ? itemLoot : createLootRecordsFromUpdates(result.mvu_updates));
  const baseEvents = klona(session.pending_preview.proposed_world_events);

  result.loot_result.special_findings.forEach((finding, index) => {
    const key = `battle_loot_finding_${index + 1}`;
    baseEvents[key] = `${finding.name || `发现 ${index + 1}`}：${finding.description || finding.reason || '无补充说明'}`;
  });

  return {
    preview: PendingPreviewSchema.parse(
      {
        summary: session.pending_preview.summary || '战利品结算完成',
        proposed_world_events: baseEvents,
        proposed_combatants: buildCombatantsFromMainState(nextMainState),
        proposed_loot: nextLoot,
      },
      { reportInput: true },
    ),
    accumulatedUpdates,
  };
}
