import type { BattleImportedWorldbook, BattleWorldbookSource } from './ai-profile.ts';

type SillyTavernWorldbookEntry = {
  uid?: number | string;
  comment?: string;
  key?: string[];
  keys?: string[];
  content?: string;
  disable?: boolean;
};

type SillyTavernContext = {
  characterId?: number | string;
  characters?: Array<{
    data?: {
      extensions?: {
        world?: string;
      };
    };
  }>;
  getRequestHeaders?: () => Record<string, string>;
  loadWorldInfo?: (name: string) => Promise<{ entries?: Record<string, SillyTavernWorldbookEntry> } | null>;
};

type SillyTavernHost = Window & {
  SillyTavern?: {
    getContext?: () => SillyTavernContext;
  };
};

export type BattleWorldbookContent = {
  name: string;
  source: BattleWorldbookSource;
  entries: SillyTavernWorldbookEntry[];
};

function getSillyTavernContext(): SillyTavernContext | null {
  const hosts = [window, window.parent, window.top].filter((host): host is Window => Boolean(host));
  for (const host of hosts) {
    try {
      const context = (host as SillyTavernHost).SillyTavern?.getContext?.();
      if (context) {
        return context;
      }
    } catch {}
  }
  return null;
}

function getEnabledEntries(entries: Record<string, SillyTavernWorldbookEntry> | undefined): SillyTavernWorldbookEntry[] {
  return Object.values(entries ?? {}).filter(entry => !entry.disable && (entry.content ?? '').trim());
}

export function entriesToText(entries: SillyTavernWorldbookEntry[]): string {
  return entries
    .map(entry => {
      const keys = entry.key ?? entry.keys ?? [];
      const title = entry.comment || keys.join(', ') || '条目';
      return [`### ${title}`, entry.content ?? ''].join('\n');
    })
    .join('\n\n')
    .trim();
}

export function serializeImportedWorldbooks(worldbooks: BattleImportedWorldbook[], maxChars: number): string[] {
  const enabled = worldbooks.filter(worldbook => worldbook.enabled && worldbook.content.trim());
  const budget = Math.max(0, Math.floor(maxChars || 0));
  if (budget <= 0) {
    return [];
  }

  const contexts: string[] = [];
  let used = 0;
  for (const worldbook of enabled) {
    const header = `【背景参考 - 非强制性】世界书：${worldbook.name}\n来源：${worldbook.source}\n`;
    const remaining = budget - used - header.length;
    if (remaining <= 0) {
      break;
    }
    const content = worldbook.content.slice(0, remaining);
    contexts.push(`${header}${content}`);
    used += header.length + content.length;
  }
  return contexts;
}

export async function listBattleWorldbookNames(): Promise<string[]> {
  const context = getSillyTavernContext();
  if (!context) {
    throw new Error('无法读取 SillyTavern 上下文');
  }
  const response = await fetch('/api/settings/get', {
    method: 'POST',
    headers: { ...(context.getRequestHeaders?.() ?? {}), 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`读取世界书列表失败：HTTP ${response.status}`);
  }
  const settings = await response.json();
  return Array.isArray(settings.world_names) ? settings.world_names.filter((name: unknown): name is string => typeof name === 'string') : [];
}

export async function loadBattleWorldbookContent(
  name: string,
  source: BattleWorldbookSource = 'manual',
): Promise<BattleWorldbookContent | null> {
  const context = getSillyTavernContext();
  if (!context?.loadWorldInfo) {
    throw new Error('当前环境不支持 loadWorldInfo');
  }
  const data = await context.loadWorldInfo(name);
  const entries = getEnabledEntries(data?.entries);
  if (!entries.length) {
    return null;
  }
  return { name, source, entries };
}

export async function listActiveBattleWorldbooks(): Promise<BattleWorldbookContent[]> {
  const context = getSillyTavernContext();
  if (!context?.loadWorldInfo) {
    throw new Error('当前环境不支持 loadWorldInfo');
  }

  const result: BattleWorldbookContent[] = [];
  const characterIndex = Number(context.characterId);
  const character = Number.isFinite(characterIndex) ? context.characters?.[characterIndex] : undefined;
  const characterWorld = character?.data?.extensions?.world;
  if (characterWorld) {
    const loaded = await loadBattleWorldbookContent(characterWorld, 'character');
    if (loaded) {
      result.push(loaded);
    }
  }

  try {
    const response = await fetch('/api/settings/get', {
      method: 'POST',
      headers: { ...(context.getRequestHeaders?.() ?? {}), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (response.ok) {
      const settings = await response.json();
      const parsedSettings = typeof settings.settings === 'string' ? JSON.parse(settings.settings) : settings.settings;
      const globalNames = parsedSettings?.world_info_settings?.world_info?.globalSelect ?? [];
      for (const name of Array.isArray(globalNames) ? globalNames : []) {
        if (typeof name !== 'string') {
          continue;
        }
        const loaded = await loadBattleWorldbookContent(name, 'global');
        if (loaded) {
          result.push(loaded);
        }
      }
    }
  } catch {}

  return result;
}

export function createImportedWorldbook(
  worldbook: BattleWorldbookContent,
  source: BattleWorldbookSource = worldbook.source,
): BattleImportedWorldbook {
  return {
    id: `${source}:${worldbook.name}`,
    name: worldbook.name,
    source,
    enabled: true,
    content: entriesToText(worldbook.entries),
    entry_count: worldbook.entries.length,
    imported_at: Date.now(),
  };
}

export function upsertImportedWorldbooks(
  current: BattleImportedWorldbook[],
  next: BattleImportedWorldbook[],
  options: { replaceAutoSources?: boolean } = {},
): BattleImportedWorldbook[] {
  const base = options.replaceAutoSources
    ? current.filter(worldbook => worldbook.source !== 'character' && worldbook.source !== 'global')
    : [...current];
  const byId = new Map(base.map(worldbook => [worldbook.id, worldbook]));
  for (const worldbook of next) {
    byId.set(worldbook.id, worldbook);
  }
  return [...byId.values()];
}
