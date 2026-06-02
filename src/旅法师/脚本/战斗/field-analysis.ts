import { parseString } from '../../../../util/common.ts';
import { buildBattleFieldSelectionSourceHash } from './field-selection.ts';
import {
  type BattleApiProfile,
  type BattleFieldAnalysisPayload,
  type BattleFieldAnalysisResult,
  type BattleFieldSelectionConfig,
  type BattleFieldSuggestion,
  type BattleProfile,
  type BattleSelectedField,
} from './ai-profile.ts';
import { BattleAiParseError, requestBattleChatCompletion } from './api-client.ts';

const BattleFieldSuggestionSchema = z
  .object({
    path: z.string().transform(value => value.trim()).catch('').prefault(''),
    label: z.string().transform(value => value.trim()).catch('').prefault(''),
    reason: z.string().transform(value => value.trim()).catch('').prefault(''),
  })
  .prefault({});

const BattleFieldAnalysisResultSchema = z
  .object({
    fields: z.array(BattleFieldSuggestionSchema).catch([]).prefault([]),
    warnings: z.array(z.string()).catch([]).prefault([]),
  })
  .prefault({});

export type BattleFieldAnalysisExecutionResult = {
  payload: BattleFieldAnalysisPayload;
  result: BattleFieldAnalysisResult;
  fieldSelection: BattleFieldSelectionConfig;
  rawText: string;
};

function resolvePromptContent(battleProfile: BattleProfile) {
  const prompt = battleProfile.prompts.field_analysis;
  if (!prompt.enabled) {
    throw new Error('字段分析 Prompt 已禁用');
  }
  return {
    systemPrompt: prompt.system_prompt,
    userPrompt: prompt.user_prompt,
    outputContractPrompt: prompt.output_contract_prompt,
  };
}

function normalizeFieldPath(path: string): string {
  return path.replace(/^stat_data\./u, '').replace(/^\.+/u, '').trim();
}

function inferFieldLabel(path: string): string {
  const normalizedPath = normalizeFieldPath(path);
  if (!normalizedPath) {
    return '未命名字段';
  }
  const segments = normalizedPath.split('.');
  return segments[segments.length - 1] || normalizedPath;
}

function createAnalysisInputHash(payload: BattleFieldAnalysisPayload): string {
  const source = JSON.stringify({
    run_mode: payload.run_mode,
    battle_protocol: payload.battle_protocol,
    stat_data: payload.stat_data,
    worldbook_context: payload.worldbook_context,
    extra_instructions: payload.extra_instructions,
  });

  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33 + source.charCodeAt(index)) >>> 0;
  }
  return `fa-${hash.toString(16)}`;
}

function normalizeFieldSuggestions(fields: BattleFieldSuggestion[], statData: Record<string, unknown>) {
  const usedPaths = new Set<string>();
  const warnings: string[] = [];
  const normalizedFields = fields.flatMap(field => {
    const normalizedPath = normalizeFieldPath(field.path);
    if (!normalizedPath || usedPaths.has(normalizedPath)) {
      return [];
    }

    if (!_.has(statData, normalizedPath)) {
      warnings.push(`字段不存在，已忽略：${normalizedPath}`);
      return [];
    }

    usedPaths.add(normalizedPath);
    return [
      {
        path: normalizedPath,
        label: field.label.trim() || inferFieldLabel(normalizedPath),
        enabled: true,
        source: 'ai' as const,
        reason: field.reason.trim(),
        value_kind: 'unknown' as const,
      },
    ];
  });

  return { normalizedFields, warnings };
}

export function buildBattleFieldAnalysisPayload(
  battleProfile: BattleProfile,
  statData: Record<string, unknown>,
): BattleFieldAnalysisPayload {
  if (!battleProfile.rules.allow_full_stat_data_in_analysis) {
    throw new Error('当前战斗配置禁止在字段分析阶段发送完整 stat_data');
  }

  return {
    task: 'analyze_battle_fields',
    run_mode: battleProfile.run_mode,
    battle_protocol: battleProfile.rules.battle_protocol.trim(),
    stat_data: _.omit(statData, 'battle_session') as Record<string, unknown>,
    worldbook_context: [],
    extra_instructions: battleProfile.context.extra_context_text.trim(),
  };
}

export async function analyzeBattleFields(
  apiProfile: BattleApiProfile,
  battleProfile: BattleProfile,
  statData: Record<string, unknown>,
): Promise<BattleFieldAnalysisExecutionResult> {
  const payload = buildBattleFieldAnalysisPayload(battleProfile, statData);
  const promptContent = resolvePromptContent(battleProfile);
  const completion = await requestBattleChatCompletion(
    apiProfile,
    [
      { role: 'system', content: promptContent.systemPrompt },
      {
        role: 'user',
        content: [
          promptContent.userPrompt,
          '',
          'field_analysis_payload=',
          JSON.stringify(payload, null, 2),
          '',
          promptContent.outputContractPrompt,
        ].join('\n'),
      },
    ],
    {
      responseFormat: 'json_object',
      maxTokens: apiProfile.default_request_options.max_tokens,
      temperature: 0,
      topP: 1,
    },
  );

  let parsed: BattleFieldAnalysisResult;
  try {
    parsed = BattleFieldAnalysisResultSchema.parse(parseString(completion.text), { reportInput: true });
  } catch (error) {
    throw new BattleAiParseError(
      error instanceof Error ? `字段分析结果解析失败：${error.message}` : '字段分析结果解析失败',
      {
        rawText: completion.text,
        responseData: completion.data,
        payload,
        cause: error,
      },
    );
  }
  const { normalizedFields, warnings: pathWarnings } = normalizeFieldSuggestions(parsed.fields, payload.stat_data);
  const mergedWarnings = _.uniq([...parsed.warnings, ...pathWarnings]);

  return {
    payload,
    result: {
      fields: normalizedFields.map(field => ({
        path: field.path,
        label: field.label,
        reason: field.reason,
      })),
      warnings: mergedWarnings,
    },
    fieldSelection: {
      selected_fields: normalizedFields,
      analysis_warnings: mergedWarnings,
      last_analysis_input_hash: createAnalysisInputHash(payload),
      source_data_hash: buildBattleFieldSelectionSourceHash(statData),
      last_analysis_at: Date.now(),
      manual_review_required: true,
    },
    rawText: completion.text,
  };
}
