import { klona } from 'klona';
import { PrebattleSnapshotSchema, type BattleSession, type MainState, type Schema as CanonicalState } from '../../schema.ts';

export function createPrebattleSnapshot(state: MainState, sourceMessageId: number): BattleSession['prebattle_snapshot'] {
  const snapshot = {
    source_message_id: sourceMessageId,
    世界: klona(state.世界),
    主角: klona(state.主角),
    队伍: klona(state.队伍),
    敌方: klona(state.敌方),
    背包: klona(state.背包),
    任务: klona(state.任务),
    当前可见卡: klona(state.当前可见卡),
  };
  return PrebattleSnapshotSchema.parse(snapshot, { reportInput: true });
}

export function restorePrebattleSnapshot(current: CanonicalState, snapshot: BattleSession['prebattle_snapshot']): CanonicalState {
  return {
    ...current,
    世界: klona(snapshot.世界),
    主角: klona(snapshot.主角),
    队伍: klona(snapshot.队伍),
    敌方: klona(snapshot.敌方),
    背包: klona(snapshot.背包),
    任务: klona(snapshot.任务),
    当前可见卡: klona(snapshot.当前可见卡),
  };
}
