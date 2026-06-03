import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import {
  createDefaultBattleApiTestResult,
  type BattleApiProfile,
  type BattleApiTestResult,
} from './ai-profile';

export type BattleApiRequest = <T = unknown>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>;

export type BattleModelDiscoveryResult = {
  models: string[];
  status: number;
};

export type BattleChatMessageRole = 'system' | 'user' | 'assistant';

export type BattleChatMessage = {
  role: BattleChatMessageRole;
  content: string;
};

export type BattleChatCompletionOptions = {
  responseFormat?: 'json_object';
  maxTokens?: number | null;
  temperature?: number | null;
  topP?: number | null;
  timeoutMs?: number;
  retryLimit?: number;
  extraBody?: Record<string, unknown>;
};

export type BattleChatCompletionResult = {
  status: number;
  text: string;
  data: unknown;
};

export class BattleAiParseError extends Error {
  readonly rawText: string;
  readonly responseData: unknown;
  readonly payload: Record<string, unknown> | null;

  constructor(
    message: string,
    options: {
      rawText: string;
      responseData: unknown;
      payload?: Record<string, unknown> | null;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'BattleAiParseError';
    this.rawText = options.rawText;
    this.responseData = options.responseData;
    this.payload = options.payload ?? null;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/u, '');
}

function normalizeLeadingSlash(value: string): string {
  if (!value) {
    return '';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function trimKnownEndpointSuffix(value: string): string {
  return value
    .replace(/\/v1\/chat\/completions$/iu, '/v1')
    .replace(/\/chat\/completions$/iu, '')
    .replace(/\/v1\/models$/iu, '/v1')
    .replace(/\/models$/iu, '');
}

export function resolveBattleApiBaseUrl(baseUrl: string): string {
  return trimKnownEndpointSuffix(trimTrailingSlash(baseUrl));
}

export function resolveBattleApiUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//iu.test(path)) {
    return path;
  }

  const normalizedBaseUrl = resolveBattleApiBaseUrl(baseUrl);
  const normalizedPath = normalizeLeadingSlash(path);
  const dedupedPath =
    /\/v1$/iu.test(normalizedBaseUrl) && /^\/v1\//iu.test(normalizedPath)
      ? normalizedPath.slice(3)
      : normalizedPath;
  return `${normalizedBaseUrl}${dedupedPath}`;
}

export function createBattleApiHeaders(
  profile: BattleApiProfile,
  options: {
    includeAuth?: boolean;
    includeJsonContentType?: boolean;
  } = {},
): Record<string, string> {
  const headers = Object.fromEntries(
    Object.entries(profile.headers).filter(([, value]) => value.trim().length > 0),
  );

  if (options.includeAuth !== false && profile.api_key.trim()) {
    headers.Authorization = `Bearer ${profile.api_key.trim()}`;
  }

  if (options.includeJsonContentType !== false) {
    headers['Content-Type'] = 'application/json';
  }

  headers.Accept = 'application/json';
  return headers;
}

function shouldRetryBattleRequest(status: number | undefined, message: string): boolean {
  if (status !== undefined) {
    return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
  }

  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('network error') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('socket hang up')
  );
}

async function waitForBattleRetry(attempt: number): Promise<void> {
  const delayMs = 500 * 2 ** attempt;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

function extractModelIds(payload: unknown, responsePath: string): string[] {
  const bucket = responsePath.trim() ? _.get(payload, responsePath.trim(), payload) : payload;
  if (!Array.isArray(bucket)) {
    return [];
  }

  return _(bucket)
    .map(entry => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      if (_.isPlainObject(entry)) {
        const id = _.get(entry, 'id');
        if (typeof id === 'string') {
          return id.trim();
        }
      }
      return '';
    })
    .filter(value => value.length > 0)
    .uniq()
    .value();
}

function extractBattleAssistantText(payload: unknown): string {
  const directContent = _.get(payload, 'choices[0].message.content');
  if (typeof directContent === 'string') {
    return directContent.trim();
  }

  if (Array.isArray(directContent)) {
    return directContent
      .flatMap(entry => {
        if (typeof entry === 'string') {
          return [entry];
        }
        if (_.isPlainObject(entry)) {
          const text = _.get(entry, 'text');
          const content = _.get(entry, 'content');
          return [typeof text === 'string' ? text : '', typeof content === 'string' ? content : ''];
        }
        return [];
      })
      .filter(value => value.length > 0)
      .join('\n')
      .trim();
  }

  return '';
}

export async function fetchBattleApiModels(
  profile: BattleApiProfile,
  requestImpl: BattleApiRequest = axios.request,
): Promise<BattleModelDiscoveryResult> {
  const getModelListFn = getBattleModelList();
  if (getModelListFn && profile.base_url.trim()) {
    const models = await getModelListFn({
      apiurl: resolveBattleApiBaseUrl(profile.base_url),
      ...(profile.api_key.trim() ? { key: profile.api_key.trim() } : {}),
    });
    return {
      models: _(models)
        .map(model => model.trim())
        .filter(Boolean)
        .uniq()
        .value(),
      status: 200,
    };
  }

  const url = resolveBattleApiUrl(profile.base_url, profile.model_fetch_path || '/v1/models');
  const response = await requestImpl({
    method: 'GET',
    url,
    timeout: profile.default_request_options.timeout_ms,
    headers: createBattleApiHeaders(profile, {
      includeAuth: profile.model_discovery.use_auth_header,
      includeJsonContentType: false,
    }),
  });

  return {
    models: extractModelIds(response.data, profile.model_discovery.response_path || 'data'),
    status: response.status,
  };
}

function buildConnectionTestPayload(profile: BattleApiProfile) {
  const body: Record<string, unknown> = {
    model: profile.model.trim(),
    stream: false,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
  };

  if (profile.default_request_options.temperature !== null) {
    body.temperature = profile.default_request_options.temperature;
  }

  if (profile.default_request_options.top_p !== null) {
    body.top_p = profile.default_request_options.top_p;
  }

  return body;
}

function getBattleGenerateRaw(): typeof generateRaw | null {
  const generateRawFn: unknown = (globalThis as Record<string, unknown>).generateRaw;
  return typeof generateRawFn === 'function' ? (generateRawFn as typeof generateRaw) : null;
}

function getBattleModelList(): typeof getModelList | null {
  const getModelListFn: unknown = (globalThis as Record<string, unknown>).getModelList;
  return typeof getModelListFn === 'function' ? (getModelListFn as typeof getModelList) : null;
}

function createBattleGenerateCustomApi(
  profile: BattleApiProfile,
  options: BattleChatCompletionOptions = {},
): CustomApiConfig | undefined {
  const baseUrl = profile.base_url.trim();
  const apiKey = profile.api_key.trim();
  const model = profile.model.trim();
  const customApi: CustomApiConfig = {};

  if (baseUrl && apiKey) {
    customApi.apiurl = resolveBattleApiBaseUrl(baseUrl);
    customApi.key = apiKey;
    customApi.source = profile.provider_type === 'custom' ? undefined : 'openai';
  }

  if (model) {
    customApi.model = model;
  }

  const maxTokens = options.maxTokens ?? profile.default_request_options.max_tokens;
  if (maxTokens !== null && maxTokens !== undefined) {
    customApi.max_tokens = maxTokens;
  }

  const temperature = options.temperature ?? profile.default_request_options.temperature;
  if (temperature !== null && temperature !== undefined) {
    customApi.temperature = temperature;
  }

  const topP = options.topP ?? profile.default_request_options.top_p;
  if (topP !== null && topP !== undefined) {
    customApi.top_p = topP;
  }

  return Object.keys(customApi).length ? customApi : undefined;
}

function extractGenerateRawText(result: string | GenerateToolCallResult): string {
  return typeof result === 'string' ? result.trim() : result.content.trim();
}

async function requestBattleGenerateRaw(
  profile: BattleApiProfile,
  messages: BattleChatMessage[],
  options: BattleChatCompletionOptions = {},
): Promise<BattleChatCompletionResult | null> {
  const generateRawFn = getBattleGenerateRaw();
  if (!generateRawFn) return null;

  try {
    const customApi = createBattleGenerateCustomApi(profile, options);
    const result = await generateRawFn({
      generation_id: `battle-runtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      should_silence: true,
      should_stream: false,
      max_chat_history: 0,
      ordered_prompts: messages.map(m => ({ role: m.role, content: m.content })),
      ...(customApi ? { custom_api: customApi } : {}),
    });

    const text = extractGenerateRawText(result);
    if (!text) {
      throw new Error('generateRaw 返回空文本');
    }

    return { status: 200, text, data: result };
  } catch (generateError) {
    const message = generateError instanceof Error ? generateError.message : String(generateError);
    throw new Error(`请求失败（generateRaw）：${message}`);
  }
}

export async function requestBattleChatCompletion(
  profile: BattleApiProfile,
  messages: BattleChatMessage[],
  options: BattleChatCompletionOptions = {},
  requestImpl: BattleApiRequest = axios.request,
): Promise<BattleChatCompletionResult> {
  const tavernResult = await requestBattleGenerateRaw(profile, messages, options);
  if (tavernResult) {
    return tavernResult;
  }

  if (!profile.base_url.trim()) {
    throw new Error('缺少 base_url');
  }

  if (!profile.model.trim()) {
    throw new Error('缺少 model');
  }

  const timeoutMs = options.timeoutMs ?? profile.default_request_options.timeout_ms;
  const retryLimit = options.retryLimit ?? profile.default_request_options.retry_limit;

  for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
    try {
      const body: Record<string, unknown> = {
        model: profile.model.trim(),
        messages,
        stream: false,
        ...options.extraBody,
      };

      const maxTokens = options.maxTokens ?? profile.default_request_options.max_tokens;
      if (maxTokens !== null && maxTokens !== undefined) {
        body.max_tokens = maxTokens;
      }

      const temperature = options.temperature ?? profile.default_request_options.temperature;
      if (temperature !== null && temperature !== undefined) {
        body.temperature = temperature;
      }

      const topP = options.topP ?? profile.default_request_options.top_p;
      if (topP !== null && topP !== undefined) {
        body.top_p = topP;
      }

      if (options.responseFormat === 'json_object') {
        body.response_format = { type: 'json_object' };
      }

      const response = await requestImpl({
        method: 'POST',
        url: resolveBattleApiUrl(profile.base_url, '/chat/completions'),
        timeout: timeoutMs,
        headers: createBattleApiHeaders(profile),
        data: body,
      });

      const text = extractBattleAssistantText(response.data);
      if (!text) {
        throw new Error('接口返回成功，但未解析到 assistant 文本');
      }

      return {
        status: response.status,
        text,
        data: response.data,
      };
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const status = axiosError?.response?.status;
      const message =
        axiosError?.response?.data && typeof axiosError.response.data === 'object'
          ? JSON.stringify(axiosError.response.data)
          : axiosError?.message ?? (error instanceof Error ? error.message : String(error));

      if (!shouldRetryBattleRequest(status, message) || attempt >= retryLimit) {
        throw new Error(status ? `请求失败（HTTP ${status}）：${message}` : `请求失败：${message}`);
      }

      await waitForBattleRetry(attempt);
    }
  }

  throw new Error('请求失败：超过最大重试次数');
}

export async function testBattleApiConnection(
  profile: BattleApiProfile,
  requestImpl: BattleApiRequest = axios.request,
): Promise<BattleApiTestResult> {
  const failure = createDefaultBattleApiTestResult();
  failure.checked_at = Date.now();

  const tavernGenerateRaw = getBattleGenerateRaw();
  if (tavernGenerateRaw) {
    try {
      await requestBattleGenerateRaw(
        profile,
        [{ role: 'user', content: 'ping' }],
        {
          maxTokens: 1,
          temperature: profile.default_request_options.temperature,
          topP: profile.default_request_options.top_p,
        },
      );
      return {
        ok: true,
        checked_at: Date.now(),
        message: '连接成功（generateRaw）',
        model_count: null,
      };
    } catch (error) {
      return {
        ...failure,
        message: `连接失败（generateRaw）：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!profile.base_url.trim()) {
    return {
      ...failure,
      message: '缺少 base_url',
    };
  }

  if (!profile.model.trim()) {
    return {
      ...failure,
      message: '缺少 model',
    };
  }

  try {
    const response = await requestImpl({
      method: 'POST',
      url: resolveBattleApiUrl(profile.base_url, '/chat/completions'),
      timeout: profile.default_request_options.timeout_ms,
      headers: createBattleApiHeaders(profile),
      data: buildConnectionTestPayload(profile),
    });

    return {
      ok: true,
      checked_at: Date.now(),
      message: `连接成功（HTTP ${response.status}）`,
      model_count: null,
    };
  } catch (error) {
    const axiosError = axios.isAxiosError(error) ? error : null;
    const status = axiosError?.response?.status;
    const message =
      axiosError?.response?.data && typeof axiosError.response.data === 'object'
        ? JSON.stringify(axiosError.response.data)
        : axiosError?.message ?? (error instanceof Error ? error.message : String(error));

    return {
      ok: false,
      checked_at: Date.now(),
      message: status ? `连接失败（HTTP ${status}）：${message}` : `连接失败：${message}`,
      model_count: null,
    };
  }
}
