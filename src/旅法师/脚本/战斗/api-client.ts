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

export async function fetchBattleApiModels(
  profile: BattleApiProfile,
  requestImpl: BattleApiRequest = axios.request,
): Promise<BattleModelDiscoveryResult> {
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

export async function testBattleApiConnection(
  profile: BattleApiProfile,
  requestImpl: BattleApiRequest = axios.request,
): Promise<BattleApiTestResult> {
  const failure = createDefaultBattleApiTestResult();
  failure.checked_at = Date.now();

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
