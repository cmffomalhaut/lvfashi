import { klona } from 'klona';
import { PendingPreviewSchema, type BattleSession, type MainState } from '../../schema.ts';

const BATTLE_RULE_SUMMARY = [
  '阵营回合制：当前行动阵营完整行动后切换到对方阵营。',
  '每单位每回合固定 1 个主技能位 + 1 个动作位；不用技能时可转为额外动作。',
  '玩家只直接控制主角，其余我方与敌方由 AI 代控。',
  '玩家主技能默认消耗本回合唯一明骰；其他检定顺序消耗共享暗骰池。',
  '只返回当前回合所需的轻量预览与变量草案，不输出历史战斗全文。',
].join('\n');

function getRemainingDarkPool(session: BattleSession) {
  return session.shared_dark_pool.values.slice(session.shared_dark_pool.cursor);
}

/** 从 runtime.history 取最近 N 个回合记录发给 AI，让 AI 了解战局演变 */
function getRecentRoundHistory(session: BattleSession, maxCount = 20) {
  const history = session.runtime.history ?? [];
  return history.slice(-maxCount).map(h => klona(h));
}

export function buildNormalPromptPayload(state: MainState) {
  return {
    世界: klona(state.世界),
    主角: klona(state.主角),
    队伍: klona(state.队伍),
    敌方: klona(state.敌方),
    背包: klona(state.背包),
    任务: klona(state.任务),
    当前可见卡: klona(state.当前可见卡),
    prompt_guard: {
      excludes: ['battle_session', 'CombatLog', 'DicePool'],
    },
  };
}

/**
 * 构造发给 AI 的战斗 prompt，顺序按用户要求：
 * 1. 战斗规则
 * 2. 原始 MVU 数据（从 prebattle_snapshot + 当前 combatants 重构）
 * 3. 已发生的全部（或最近）回合历史
 * 4. 本回合战斗上下文（meta、round、暗骰池等）
 */
export function buildBattleRoundPrompt(session: BattleSession) {
  if (!session.激活) {
    throw new Error('battle_session is not active');
  }
  if (!session.player_check.confirmed) {
    throw new Error('player_check must be confirmed before building battle prompt');
  }

  const remainingDarkPool = getRemainingDarkPool(session);
  const roundHistory = getRecentRoundHistory(session);

  return {
    // 1. 战斗规则优先
    规则摘要: BATTLE_RULE_SUMMARY,

    // 2. 原始 MVU 数据 — 让 AI 自行分辨哪些发生了变化
    世界: klona(session.prebattle_snapshot.世界),
    主角: klona(session.prebattle_snapshot.主角),
    队伍: klona(session.combatants.allies),
    敌方: klona(session.combatants.enemies),
    背包: klona(session.prebattle_snapshot.背包),
    任务: klona(session.prebattle_snapshot.任务),
    当前可见卡: klona(session.prebattle_snapshot.当前可见卡),

    // 3. 已发生的回合历史（round_no / summary / narration）
    历史回合: roundHistory,

    // 4. 本回合战斗上下文
    meta: klona(session.meta),
    round: klona(session.round),
    phase: session.phase,
    玩家策略: session.player_check.strategy_text,
    玩家最终明骰: session.player_check.roll,
    明骰重掷次数: session.player_check.reroll_used,
    共享暗骰池: {
      remaining_values: remainingDarkPool,
      next_value: remainingDarkPool[0] ?? null,
      consumed: session.shared_dark_pool.cursor,
    },
    output_mode: session.output_mode,
  };
}

export function createPendingPreviewFromPrompt(session: BattleSession) {
  const promptPayload = buildBattleRoundPrompt(session);
  const remaining = promptPayload.共享暗骰池.remaining_values.length;
  const nextDarkRoll = promptPayload.共享暗骰池.next_value;
  const roundLabel = `第${promptPayload.round.round_no}回合`;
  const summary = [
    roundLabel,
    `策略：${promptPayload.玩家策略 || '未填写策略'}`,
    `明骰：${promptPayload.玩家最终明骰}`,
    nextDarkRoll === null ? '暗骰：已耗尽，由 AI 口胡补完' : `下一枚暗骰：${nextDarkRoll}`,
    `暗骰池剩余：${remaining}`,
  ].join(' | ');

  return PendingPreviewSchema.parse(
    {
      summary,
      proposed_world_events: {
        [`battle_round_${promptPayload.round.round_no}`]: summary,
      },
      proposed_combatants: {
        allies: klona(promptPayload.队伍),
        enemies: klona(promptPayload.敌方),
      },
      proposed_loot: {},
    },
    { reportInput: true },
  );
}
