import { parseString, uuidv4 } from '../../../../util/common.ts';
import { PendingPreviewSchema, type BattleSession } from '../../schema.ts';
import { buildBattleRoundPrompt } from './prompt.ts';

export type BattleAiResolver = (
  session: BattleSession,
) => Promise<BattleSession['pending_preview']>;

const BATTLE_PREVIEW_JSON_SCHEMA = {
  name: 'planeswalker_battle_preview',
  description: '旅法师战斗单回合结算预览，供前端展示并等待用户确认后写入 battle_session。',
  strict: true,
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string', description: '对当前回合结果的简要总结。' },
      proposed_world_events: {
        type: 'object',
        description: '若本回合需要写入近期事务的轻量事件草案。',
        additionalProperties: { type: 'string' },
      },
      proposed_combatants: {
        type: 'object',
        additionalProperties: false,
        properties: {
          allies: { type: 'object', description: '沿用输入 combatants.allies 的完整副本并带本回合变更。', additionalProperties: true },
          enemies: { type: 'object', description: '沿用输入 combatants.enemies 的完整副本并带本回合变更。', additionalProperties: true },
        },
        required: ['allies', 'enemies'],
      },
      proposed_loot: {
        type: 'object',
        description: '若本回合已明确产生战利品，则写入草案；否则返回空对象。',
        additionalProperties: true,
      },
    },
    required: ['summary', 'proposed_world_events', 'proposed_combatants', 'proposed_loot'],
  },
} as const;

function buildBattleResolveSystemPrompt() {
  return [
    '你是旅法师战斗回合裁定器。',
    '你的任务是根据 battle prompt，只返回“本回合预览草案”，而不是终局结算。',
    '必须遵守：',
    '1. 只处理当前回合，不要编造下一回合。',
    '2. 只能返回 JSON Schema 要求的字段。',
    '3. proposed_combatants 必须保留原有单位 id，并在副本上做本回合数值/状态变更。',
    '4. 若没有明确掉落，proposed_loot 返回空对象。',
    '5. 若没有近期事务草案，proposed_world_events 返回空对象。',
    '6. 不输出 battle_session、CombatLog、DicePool 原文，不输出解释性前后缀。',
    '7. 若信息不足，保持单位结构不变，并在 summary 里说明裁定保守。',
  ].join('\n');
}

export function createBattleAiResolver(generateImpl?: typeof generateRaw): BattleAiResolver {
  return async session => {
    const runtimeGenerate =
      generateImpl ??
      ((globalThis as typeof globalThis & { generateRaw?: typeof generateRaw }).generateRaw
        ? (globalThis as typeof globalThis & { generateRaw: typeof generateRaw }).generateRaw
        : undefined);
    if (!runtimeGenerate) {
      throw new Error('generateRaw is not available in current runtime');
    }
    const promptPayload = buildBattleRoundPrompt(session);
    const result = await runtimeGenerate({
      generation_id: `planeswalker-battle-${uuidv4()}`,
      should_silence: true,
      should_stream: false,
      max_chat_history: 0,
      ordered_prompts: [
        { role: 'system', content: buildBattleResolveSystemPrompt() },
        {
          role: 'user',
          content: `请按给定 JSON Schema 返回本回合预览草案。\n\nbattle_prompt=\n${JSON.stringify(promptPayload, null, 2)}`,
        },
      ],
      json_schema: BATTLE_PREVIEW_JSON_SCHEMA,
    });

    if (typeof result !== 'string') {
      throw new Error('battle ai resolver expected JSON string but received tool call result');
    }

    return PendingPreviewSchema.parse(parseString(result), { reportInput: true });
  };
}

export const battleAiResolver = createBattleAiResolver();
