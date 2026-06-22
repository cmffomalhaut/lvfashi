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
import { BattleAiParseError, type BattleChatMessage, requestBattleChatCompletion } from './api-client.ts';

function normalizeBattleStateValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['finished', 'finish', 'end', 'ended', 'done', '结束', '已结束', '战斗结束'].includes(normalized)) {
    return 'finished';
  }
  if (['ongoing', 'running', 'active', 'in_progress', 'progress', '进行中', '战斗中', '未结束'].includes(normalized)) {
    return 'ongoing';
  }
  return value;
}

function normalizeSettlementDecision(value: unknown): unknown {
  if (value == null) {
    return {};
  }
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();
  return {
    mode: 'checked_loot',
    mvu_commit_ready: false,
    loot_ready: false,
    loot_context: text ? { settlement_text: text } : {},
    check_prompt_needed: false,
  };
}

function normalizeLootResult(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return {
      has_loot: false,
      loot_items: [],
      special_findings: [],
    };
  }
  return value;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).filter(Boolean);
  }
  if (_.isPlainObject(value)) {
    const lines: string[] = [];
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (_.isPlainObject(item)) {
        for (const [innerKey, innerValue] of Object.entries(item as Record<string, unknown>)) {
          lines.push(`${key}：${innerKey}${typeof innerValue === 'string' ? ` ${innerValue}` : ` ${JSON.stringify(innerValue)}`}`);
        }
      } else {
        lines.push(`${key}：${typeof item === 'string' ? item : JSON.stringify(item)}`);
      }
    }
    return lines;
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function extractRoundIndex(text: string, fallbackIndex: number): number {
  const matched = text.match(/第\s*(\d+)\s*回合/u);
  if (!matched) {
    return fallbackIndex;
  }

  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackIndex;
}

function normalizeRoundDigest(value: unknown, index = 0): unknown {
  if (typeof value === 'string') {
    const text = value.trim();
    return {
      round_index: extractRoundIndex(text, index + 1),
      summary: text,
      narration: text,
    };
  }

  if (value && typeof value === 'object') {
    const candidate = { ...(value as Record<string, unknown>) };
    candidate.round_index = extractRoundIndex(
      typeof candidate.summary === 'string' && candidate.summary.trim()
        ? candidate.summary
        : typeof candidate.narration === 'string'
          ? candidate.narration
          : '',
      index + 1,
    );
    return candidate;
  }

  return value;
}

function extractJsonCodeBlocks(text: string): string[] {
  return [...text.matchAll(/```(?:json|json5)?\s*([\s\S]*?)```/giu)]
    .map(match => match[1]?.trim() ?? '')
    .filter(Boolean);
}

function extractBalancedStructuredBlock(text: string): string | null {
  const source = text.trim();
  const start = source.search(/[[{]/u);
  if (start < 0) {
    return null;
  }

  const opener = source[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index++) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return source.slice(start);
}

function parseRuntimeStructuredText(text: string): unknown {
  const candidates = [
    text,
    ...extractJsonCodeBlocks(text),
    extractBalancedStructuredBlock(text),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return parseString(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.at(-1) ?? '未找到可解析的 JSON/YAML 结构');
}

function normalizeFullBattleAsRound(value: Record<string, unknown>): Record<string, unknown> {
  const rounds = Array.isArray(value.rounds) ? value.rounds : [];
  const lastRound = normalizeRoundDigest(rounds.at(-1), rounds.length - 1);
  const lastRoundRecord = lastRound && typeof lastRound === 'object' ? (lastRound as Record<string, unknown>) : {};
  const battleState = normalizeBattleStateValue(value.battle_state);
  const battleEndReason = typeof value.battle_end_reason === 'string' ? value.battle_end_reason : '';
  const battleReport = typeof value.battle_report === 'string' ? value.battle_report : '';
  const summary =
    (typeof lastRoundRecord.summary === 'string' && lastRoundRecord.summary.trim()) ||
    battleReport ||
    battleEndReason ||
    '整场战斗已返回';

  return {
    result_type: 'round',
    battle_state: battleState === 'finished' ? 'finished' : 'ongoing',
    round_index: Number(lastRoundRecord.round_index) || rounds.length || 1,
    summary,
    narration: (typeof lastRoundRecord.narration === 'string' && lastRoundRecord.narration.trim()) || summary,
    selected_data_updates: _.isPlainObject(value.final_selected_data_updates) ? value.final_selected_data_updates : {},
    status_changes: [],
    resource_changes: [],
    battle_end: battleState === 'finished',
    battle_end_reason: battleEndReason,
    settlement: value.settlement,
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
  };
}

const BattleSettlementDecisionSchema = z
  .preprocess(
    normalizeSettlementDecision,
    z
  .object({
    mode: z.enum(['no_loot', 'direct_loot', 'checked_loot']).catch('no_loot').prefault('no_loot'),
    mvu_commit_ready: z.boolean().catch(false).prefault(false),
    loot_ready: z.boolean().catch(false).prefault(false),
    loot_context: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    check_prompt_needed: z.boolean().catch(false).prefault(false),
  })
      .prefault({}),
  )
  .prefault({});

const BattleRoundDigestSchema = z
  .preprocess(
    value => normalizeRoundDigest(value, 0),
    z
  .object({
    round_index: z.coerce.number().catch(0).prefault(0),
    summary: z.string().catch('').prefault(''),
    narration: z.string().catch('').prefault(''),
  })
      .prefault({}),
  )
  .prefault({});

const BattleLootResultCoreSchema = z
  .preprocess(
    normalizeLootResult,
    z
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
  )
  .prefault({});

const BattleRoundResultSchema = z
  .preprocess(
    value => {
      if (!value || typeof value !== 'object') {
        return value;
      }

      if ((value as Record<string, unknown>).result_type === 'full_battle') {
        return normalizeFullBattleAsRound(value as Record<string, unknown>);
      }

      return {
        ...(value as Record<string, unknown>),
        battle_state: normalizeBattleStateValue((value as Record<string, unknown>).battle_state),
        settlement: normalizeSettlementDecision((value as Record<string, unknown>).settlement),
        status_changes: normalizeStringList((value as Record<string, unknown>).status_changes),
        resource_changes: normalizeStringList((value as Record<string, unknown>).resource_changes),
        battle_end_reason:
          typeof (value as Record<string, unknown>).battle_end_reason === 'string'
            ? (value as Record<string, unknown>).battle_end_reason
            : '',
      };
    },
    z
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
      .prefault({}),
  )
  .prefault({});

const BattleFullResultSchema = z
  .preprocess(
    value => {
      if (!value || typeof value !== 'object') {
        return value;
      }

      const candidate = { ...(value as Record<string, unknown>) };
      candidate.battle_state = normalizeBattleStateValue(candidate.battle_state);
      candidate.settlement =
        candidate.settlement ??
        (typeof candidate.settlement_text === 'string' ? candidate.settlement_text : candidate.settlement);
      if (Array.isArray(candidate.rounds)) {
        candidate.rounds = candidate.rounds.map((round, index) => normalizeRoundDigest(round, index));
      }
      return candidate;
    },
    z
  .object({
    result_type: z.literal('full_battle').catch('full_battle').prefault('full_battle'),
    battle_state: z.literal('finished').catch('finished').prefault('finished'),
    rounds: z.array(BattleRoundDigestSchema).catch([]).prefault([]),
    final_selected_data_updates: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    battle_report: z.string().catch('').prefault(''),
    battle_end_reason: z.string().catch('').prefault(''),
    settlement: BattleSettlementDecisionSchema,
    loot_result: BattleLootResultCoreSchema,
    loot_mvu_updates: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    loot_context: z.record(z.string(), z.unknown()).catch({}).prefault({}),
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
      .prefault({}),
  )
  .prefault({});

const BattleLootResultSchema = z
  .object({
    loot_result: BattleLootResultCoreSchema,
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

export type BattleRuntimePromptKind = 'single_round' | 'full_battle' | 'loot_resolution';

export type BattleRuntimePromptSnapshot = {
  kind: BattleRuntimePromptKind;
  system: string;
  user: string;
  output: string;
  final_user_message: string;
  messages: BattleChatMessage[];
};

export type BattleRuntimeRoundExecution = {
  payload: BattleRuntimePayload;
  prompt: BattleRuntimePromptSnapshot;
  result: BattleRoundResult;
  rawText: string;
};

export type BattleRuntimeFullExecution = {
  payload: BattleRuntimePayload;
  prompt: BattleRuntimePromptSnapshot;
  result: BattleFullResult;
  rawText: string;
};

export type BattleRuntimeLootExecution = {
  payload: Record<string, unknown>;
  prompt: BattleRuntimePromptSnapshot;
  result: BattleLootResult;
  rawText: string;
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
    '根据 selected_data、战斗协议、掉落协议和玩家总体战斗倾向，一次性推演到战斗结束并完成战利品结算。',
    '返回结构化 JSON，不要输出解释性前后缀。',
  ].join('\n');
}

function buildFullBattleUserPrompt(): string {
  return '请输出整场战斗每回合摘要、最终战报、最终 selected_data_updates、结算信息和战利品结果。';
}

function buildFullBattleOutputPrompt(): string {
  return [
    '返回 JSON 字段：',
    'result_type, battle_state, rounds, final_selected_data_updates, battle_report, battle_end_reason, settlement, loot_result, loot_mvu_updates, loot_context, warnings。',
    'result_type 固定为 full_battle。',
    '快速整场模式必须根据 runtime_payload.loot_protocol 在同一次响应中完成战利品结算；若 settlement_mode 为 no_loot，则 loot_result.has_loot=false 且 loot_items 为空。',
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
  _fallbacks: { system: string; user: string; output: string },
) {
  if (!prompt.enabled) {
    throw new Error(`Prompt 已禁用：${prompt.title || '未命名 Prompt'}`);
  }

  return {
    system: prompt.system_prompt,
    user: prompt.user_prompt,
    output: prompt.output_contract_prompt,
  };
}

function createRuntimePromptSnapshot(
  kind: BattleRuntimePromptKind,
  prompt: { system: string; user: string; output: string },
  payload: Record<string, unknown>,
): BattleRuntimePromptSnapshot {
  const finalUserMessage = [prompt.user, '', 'runtime_payload=', JSON.stringify(payload, null, 2), '', prompt.output].join(
    '\n',
  );
  return {
    kind,
    system: prompt.system,
    user: prompt.user,
    output: prompt.output,
    final_user_message: finalUserMessage,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: finalUserMessage },
    ],
  };
}

function appendFullBattleLootContract(
  prompt: { system: string; user: string; output: string },
  battleProfile: BattleProfile,
): { system: string; user: string; output: string } {
  return {
    ...prompt,
    user: [
      prompt.user,
      '快速整场模式需要在同一次响应内完成战斗结束后的战利品结算；请读取 runtime_payload.loot_protocol 和 runtime_payload.settlement_mode。',
    ].join('\n'),
    output: [
      prompt.output,
      '快速整场额外必填字段：loot_result, loot_mvu_updates, loot_context。',
      `当前 settlement_mode=${battleProfile.settlement_mode}；若为 no_loot，loot_result.has_loot=false 且 loot_items 为空。`,
    ].join('\n'),
  };
}

export function buildBattleRuntimePromptSnapshot(
  battleProfile: BattleProfile,
  kind: BattleRuntimePromptKind,
  payload: Record<string, unknown>,
): BattleRuntimePromptSnapshot {
  if (kind === 'full_battle') {
    return createRuntimePromptSnapshot(
      kind,
      appendFullBattleLootContract(
        resolveRuntimePrompt(battleProfile.prompts.full_battle, {
          system: buildFullBattleSystemPrompt(),
          user: buildFullBattleUserPrompt(),
          output: buildFullBattleOutputPrompt(),
        }),
        battleProfile,
      ),
      payload,
    );
  }

  if (kind === 'loot_resolution') {
    return createRuntimePromptSnapshot(
      kind,
      resolveRuntimePrompt(battleProfile.prompts.loot_resolution, {
        system: buildLootSystemPrompt(),
        user: buildLootUserPrompt(),
        output: buildLootOutputPrompt(),
      }),
      payload,
    );
  }

  return createRuntimePromptSnapshot(
    kind,
    resolveRuntimePrompt(battleProfile.prompts.single_round, {
      system: buildSingleRoundSystemPrompt(),
      user: buildSingleRoundUserPrompt(),
      output: buildSingleRoundOutputPrompt(),
    }),
    payload,
  );
}

export function buildBattleRuntimePayload(
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): BattleRuntimePayload {
  const turnMode = options.turnMode ?? battleProfile.default_turn_mode;
  return {
    task: 'run_battle',
    run_mode: battleProfile.run_mode,
    turn_mode: turnMode,
    battle_protocol: battleProfile.rules.battle_protocol.trim(),
    ...(turnMode === 'full_battle'
      ? {
          loot_protocol: battleProfile.rules.loot_protocol.trim(),
          settlement_mode: battleProfile.settlement_mode,
        }
      : {}),
    selected_data: _.omit(klona(selectedData), 'battle_session'),
    player_command: options.playerCommand.trim(),
    dice_inputs: klona(options.diceInputs ?? {}),
    worldbook_context: klona(options.worldbookContext ?? []),
    environment_context: klona(options.environmentContext ?? {}),
    extra_instructions: [battleProfile.rules.extra_world_rules.trim(), options.extraInstructions?.trim() ?? '']
      .filter(Boolean)
      .join('\n\n'),
  };
}

export function buildBattleLootPayload(
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
    selected_data: _.omit(klona(selectedData), 'battle_session'),
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
  prompt: BattleRuntimePromptSnapshot,
  payload: Record<string, unknown>,
  parser: z.ZodType<T>,
  debugConfig: BattleDebugConfig,
): Promise<{ result: T; rawText: string; prompt: BattleRuntimePromptSnapshot }> {
  const completion = await requestBattleChatCompletion(
    apiProfile,
    prompt.messages,
    {
      responseFormat: 'json_object',
      maxTokens: apiProfile.default_request_options.max_tokens,
      temperature: apiProfile.default_request_options.temperature,
      topP: apiProfile.default_request_options.top_p,
      retryLimit: apiProfile.default_request_options.retry_limit,
    },
  );

  try {
    return {
      result: parser.parse(parseRuntimeStructuredText(completion.text), { reportInput: true }),
      rawText: completion.text,
      prompt,
    };
  } catch (error) {
    if (!debugConfig.allow_retry_on_invalid_json) {
      throw new BattleAiParseError(
        error instanceof Error ? `运行结果解析失败：${error.message}` : '运行结果解析失败',
        {
          rawText: completion.text,
          responseData: completion.data,
          payload,
          cause: error,
        },
      );
    }

    try {
      const repaired = parseRuntimeStructuredText(completion.text);
      return {
        result: parser.parse(repaired, { reportInput: true }),
        rawText: completion.text,
        prompt,
      };
    } catch (repairError) {
      throw new BattleAiParseError(
        repairError instanceof Error ? `运行结果解析失败：${repairError.message}` : '运行结果解析失败',
        {
          rawText: completion.text,
          responseData: completion.data,
          payload,
          cause: repairError,
        },
      );
    }
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
  const promptSnapshot = createRuntimePromptSnapshot('single_round', prompt, payload);
  const execution = await requestRuntimeJson(
    apiProfile,
    promptSnapshot,
    payload,
    BattleRoundResultSchema,
    battleProfile.debug,
  );
  return { payload, prompt: execution.prompt, result: execution.result, rawText: execution.rawText };
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
  const promptSnapshot = createRuntimePromptSnapshot('full_battle', appendFullBattleLootContract(prompt, battleProfile), payload);
  const execution = await requestRuntimeJson(
    apiProfile,
    promptSnapshot,
    payload,
    BattleFullResultSchema,
    battleProfile.debug,
  );
  return { payload, prompt: execution.prompt, result: execution.result, rawText: execution.rawText };
}

export async function requestBattleLootResolution(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  selectedData: Record<string, unknown>,
  options: BattleRuntimeRequestOptions,
): Promise<BattleRuntimeLootExecution> {
  const payload = buildBattleLootPayload(battleProfile, selectedData, options);
  const prompt = resolveRuntimePrompt(battleProfile.prompts.loot_resolution, {
    system: buildLootSystemPrompt(),
    user: buildLootUserPrompt(),
    output: buildLootOutputPrompt(),
  });
  const promptSnapshot = createRuntimePromptSnapshot('loot_resolution', prompt, payload);
  const execution = await requestRuntimeJson(
    apiProfile,
    promptSnapshot,
    payload,
    BattleLootResultSchema,
    battleProfile.debug,
  );
  return { payload, prompt: execution.prompt, result: execution.result, rawText: execution.rawText };
}
