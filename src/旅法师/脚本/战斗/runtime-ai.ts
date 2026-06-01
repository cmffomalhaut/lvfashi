import { klona } from 'klona';
import { parseString } from '../../../../util/common.ts';
import {
  type BattleApiProfile,
  type BattleDebugConfig,
  type BattleFullResult,
  type BattleLootResult,
  type BattleProfile,
  type BattleRoundResult,
  type BattleRuntimePayload,
} from './ai-profile.ts';
import { requestBattleChatCompletion } from './api-client.ts';

const BattleSettlementDecisionSchema = z
  .object({
    mode: z.enum(['no_loot', 'direct_loot', 'checked_loot']).catch('no_loot').prefault('no_loot'),
    mvu_commit_ready: z.boolean().catch(false).prefault(false),
    loot_ready: z.boolean().catch(false).prefault(false),
    loot_context: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    check_prompt_needed: z.boolean().catch(false).prefault(false),
  })
  .prefault({});

const BattleRoundDigestSchema = z
  .object({
    round_index: z.coerce.number().catch(0).prefault(0),
    summary: z.string().catch('').prefault(''),
    narration: z.string().catch('').prefault(''),
  })
  .prefault({});

const BattleRoundResultSchema = z
  .object({
    result_type: z.literal('round').catch('round').prefault('round'),
    battle_state: z.enum(['ongoing', 'finished']).catch('ongoing').prefault('ongoing'),
    round_index: z.coerce.number().catch(0).prefault(0),
    summary: z.string().catch('').prefault(''),
    narration: z.string().catch('').prefault(''),
    selected_data_updates: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    status_changes: z.array(z.string()).catch([]).prefault([]),
    resource_changes: z.array(z.string()).catch([]).prefault([]),
    battle_end: z.boolean().catch(false).prefault(false),
    battle_end_reason: z.string().catch('').prefault(''),
    settlement: BattleSettlementDecisionSchema,
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
  .prefault({});

const BattleFullResultSchema = z
  .object({
    result_type: z.literal('full_battle').catch('full_battle').prefault('full_battle'),
    battle_state: z.literal('finished').catch('finished').prefault('finished'),
    rounds: z.array(BattleRoundDigestSchema).catch([]).prefault([]),
    final_selected_data_updates: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    battle_report: z.string().catch('').prefault(''),
    battle_end_reason: z.string().catch('').prefault(''),
    settlement: BattleSettlementDecisionSchema,
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
  .prefault({});

const BattleLootResultSchema = z
  .object({
    loot_result: z
      .object({
        has_loot: z.boolean().catch(false).prefault(false),
        loot_items: z
          .array(
            z.object({
              name: z.string().catch('').prefault(''),
              quantity: z.coerce.number().catch(0).prefault(0),
              description: z.string().catch('').prefault(''),
              reason: z.string().catch('').prefault(''),
            }),
          )
          .catch([])
          .prefault([]),
        special_findings: z
          .array(
            z.object({
              name: z.string().catch('').prefault(''),
              description: z.string().catch('').prefault(''),
              reason: z.string().catch('').prefault(''),
            }),
          )
          .catch([])
          .prefault([]),
      })
      .prefault({}),
    mvu_updates: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    loot_context: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
  .prefault({});

export type BattleRuntimeRequestOptions = {
  playerCommand: string;
  diceInputs?: Record<string, unknown>;
  environmentContext?: Record<string, unknown>;
  worldbookContext?: string[];
  extraInstructions?: string;
  turnMode?: BattleRuntimePayload['turn_mode'];
};

export type BattleRuntimeRoundExecution = {
  payload: BattleRuntimePayload;
  result: BattleRoundResult;
};

export type BattleRuntimeFullExecution = {
  payload: BattleRuntimePayload;
  result: BattleFullResult;
};

export type BattleRuntimeLootExecution = {
  payload: Record<string, unknown>;
  result: BattleLootResult;
};

function buildSingleRoundSystemPrompt(): string {
  return [
    '你是战斗单回合裁定器。',
    '根据 selected_data、战斗协议和玩家指令，只处理当前回合。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildSingleRoundUserPrompt(): string {
  return '请根据战斗输入返回当前回合的摘要、叙述、selected_data_updates、状态变化和结算信息。';
}

function buildSingleRoundOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'result_type, battle_state, round_index, summary, narration, selected_data_updates, status_changes, resource_changes, battle_end, battle_end_reason, settlement, warnings。',
    'result_type 固定为 round。',
  ].join('\n');
}

function buildFullBattleSystemPrompt(): string {
  return [
    '你是快速整场战斗推演器。',
    '根据 selected_data、战斗协议和玩家总体战斗倾向，一次性推演到结束。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildFullBattleUserPrompt(): string {
  return '请输出整场战斗每回合摘要、最终战报、最终 selected_data_updates 和结算信息。';
}

function buildFullBattleOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'result_type, battle_state, rounds, final_selected_data_updates, battle_report, battle_end_reason, settlement, warnings。',
    'result_type 固定为 full_battle。',
  ].join('\n');
}

function buildLootSystemPrompt(): string {
  return [
    '你是战利品结算器。',
    '根据当前 selected_data、掉落协议和战斗结束上下文，返回战利品与 MVU 更新草案。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildLootUserPrompt(): string {
  return '请根据结算模式和掉落协议，返回战利品结果、附加发现和 mvu_updates。';
}

function buildLootOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'loot_result, mvu_updates, loot_context, warnings。',
  ].join('\n');
}

function resolveRuntimePrompt(
  prompt: BattleProfile['prompts']['single_round'],
  fallbacks: { system: string; user: string; output: string },
) {
  if (!prompt.enabled) {
    throw new Error(`Prompt 已禁用：${prompt.title || '未命名 Prompt'}`);
  }

  return {
    system: prompt.system_prompt.trim() || fallbacks.system,
    user: prompt.user_prompt.trim() || fallbacks.user,
    output: prompt.output_contract_prompt.trim() || fallbacks.output,
  };
}

export function buildBattleRuntimePayload(
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): BattleRuntimePayload {
  return {
    task: 'run_battle',
    run_mode: battleProfile.run_mode,
    turn_mode: options.turnMode ?? battleProfile.default_turn_mode,
    battle_protocol: battleProfile.rules.battle_protocol.trim(),
    selected_data: klona(selectedData),
    player_command: options.playerCommand.trim(),
    dice_inputs: klona(options.diceInputs ?? {}),
    worldbook_context: klona(options.worldbookContext ?? []),
    environment_context: klona(options.environmentContext ?? {}),
    extra_instructions: [battleProfile.rules.extra_world_rules.trim(), options.extraInstructions?.trim() ?? '']
      .filter(Boolean)
      .join('\n\n'),
  };
}

function buildLootPayload(
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
) {
  return {
    task: 'resolve_loot',
    run_mode: battleProfile.run_mode,
    settlement_mode: battleProfile.settlement_mode,
    battle_protocol: battleProfile.rules.battle_protocol.trim(),
    loot_protocol: battleProfile.rules.loot_protocol.trim(),
    selected_data: klona(selectedData),
    player_command: options.playerCommand.trim(),
    worldbook_context: klona(options.worldbookContext ?? []),
    environment_context: klona(options.environmentContext ?? {}),
    extra_instructions: [battleProfile.rules.extra_world_rules.trim(), options.extraInstructions?.trim() ?? '']
      .filter(Boolean)
      .join('\n\n'),
  };
}

async function requestRuntimeJson<T>(
  apiProfile: BattleApiProfile,
  prompt: { system: string; user: string; output: string },
  payload: Record<string, unknown>,
  parser: z.ZodType<T>,
  debugConfig: BattleDebugConfig,
): Promise<T> {
  const completion = await requestBattleChatCompletion(
    apiProfile,
    [
      { role: 'system', content: prompt.system },
      {
        role: 'user',
        content: [prompt.user, '', 'runtime_payload=', JSON.stringify(payload, null, 2), '', prompt.output].join('\n'),
      },
    ],
    {
      responseFormat: 'json_object',
      maxTokens: apiProfile.default_request_options.max_tokens,
      temperature: apiProfile.default_request_options.temperature,
      topP: apiProfile.default_request_options.top_p,
      retryLimit: apiProfile.default_request_options.retry_limit,
    },
  );

  try {
    return parser.parse(parseString(completion.text), { reportInput: true });
  } catch (error) {
    if (!debugConfig.allow_retry_on_invalid_json) {
      throw error;
    }

    const repaired = parseString(completion.text);
    return parser.parse(repaired, { reportInput: true });
  }
}

export async function requestBattleSingleRound(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): Promise<BattleRuntimeRoundExecution> {
  const payload = buildBattleRuntimePayload(battleProfile, selectedData, {
    ...options,
    turnMode: 'round_based',
  });
  const prompt = resolveRuntimePrompt(battleProfile.prompts.single_round, {
    system: buildSingleRoundSystemPrompt(),
    user: buildSingleRoundUserPrompt(),
    output: buildSingleRoundOutputPrompt(),
  });
  const result = await requestRuntimeJson(
    apiProfile,
    prompt,
    payload,
    BattleRoundResultSchema,
    battleProfile.debug,
  );
  return { payload, result };
}

export async function requestBattleFullBattle(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): Promise<BattleRuntimeFullExecution> {
  const payload = buildBattleRuntimePayload(battleProfile, selectedData, {
    ...options,
    turnMode: 'full_battle',
  });
  const prompt = resolveRuntimePrompt(battleProfile.prompts.full_battle, {
    system: buildFullBattleSystemPrompt(),
    user: buildFullBattleUserPrompt(),
    output: buildFullBattleOutputPrompt(),
  });
  const result = await requestRuntimeJson(
    apiProfile,
    prompt,
    payload,
    BattleFullResultSchema,
    battleProfile.debug,
  );
  return { payload, result };
}

export async function requestBattleLootResolution(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): Promise<BattleRuntimeLootExecution> {
  const payload = buildLootPayload(battleProfile, selectedData, options);
  const prompt = resolveRuntimePrompt(battleProfile.prompts.loot_resolution, {
    system: buildLootSystemPrompt(),
    user: buildLootUserPrompt(),
    output: buildLootOutputPrompt(),
  });
  const result = await requestRuntimeJson(
    apiProfile,
    prompt,
    payload,
    BattleLootResultSchema,
    battleProfile.debug,
  );
  return { payload, result };
}
