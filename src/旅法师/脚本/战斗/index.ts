import type { App as VueApp } from 'vue';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { mountBattleWindowApp } from '../../界面/战斗浮窗/index';

const OPEN = 'planeswalker:battle:open';
const CLOSE = 'planeswalker:battle:close';
const OPEN_CONTROL = '__planeswalkerBattleWindowOpen';
const CLOSE_CONTROL = '__planeswalkerBattleWindowClose';
const BATTLE_IFRAME_SRCDOC = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0 !important;
        padding: 0 !important;
        overflow: auto !important;
        background: rgba(248, 246, 240, 0.98);
      }
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
    </style>
  </head>
  <body></body>
</html>`;

let app: VueApp | null = null;
let iframe: JQuery<HTMLIFrameElement> | null = null;
let launcher: JQuery<HTMLDivElement> | null = null;
let styleHandle: { destroy: () => void } | null = null;
let mounted = false;
let mountRetryTimer: ReturnType<typeof setTimeout> | null = null;

type BattleWindowControlHost = Window & {
  [OPEN_CONTROL]?: () => void;
  [CLOSE_CONTROL]?: () => void;
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWindowVisible(): boolean {
  return Boolean(iframe?.is(':visible'));
}

function isIframeAppHealthy(): boolean {
  const body = iframe?.[0]?.contentDocument?.body;
  const appRoot = body?.querySelector('#app');
  return Boolean(mounted && iframe && body && body.childElementCount > 0 && appRoot && appRoot.childNodes.length > 0);
}

function invokeBattleWindowControl(type: typeof OPEN | typeof CLOSE, hostWindow: Window | null | undefined) {
  if (!hostWindow) {
    return;
  }
  try {
    const controlHost = hostWindow as BattleWindowControlHost;
    if (type === OPEN) {
      controlHost[OPEN_CONTROL]?.();
    } else {
      controlHost[CLOSE_CONTROL]?.();
    }
  } catch {
    // Cross-frame hosts may reject direct property access; postMessage remains the fallback.
  }
  hostWindow.postMessage({ type }, '*');
}

function invokeBattleWindowControls(type: typeof OPEN | typeof CLOSE, hostWindows: Array<Window | null | undefined>) {
  const notifiedHosts = new Set<Window>();
  for (const hostWindow of hostWindows) {
    if (!hostWindow || notifiedHosts.has(hostWindow)) {
      continue;
    }
    notifiedHosts.add(hostWindow);
    invokeBattleWindowControl(type, hostWindow);
  }
}

function clearMountRetry() {
  if (mountRetryTimer !== null) {
    clearTimeout(mountRetryTimer);
    mountRetryTimer = null;
  }
}

function reportLaunchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[planeswalker.battle-window] 启动失败', error);
  const body = iframe?.[0]?.contentDocument?.body;
  if (body) {
    body.innerHTML = `
      <div style="min-height:100vh;box-sizing:border-box;padding:20px;background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.98));color:#fecaca;font:14px/1.6 'Segoe UI','Microsoft YaHei UI',sans-serif;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#fecaca;">战斗浮窗启动失败</h2>
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message)}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
          <button id="battle-error-retry" style="border:1px solid rgba(255,255,255,0.24);border-radius:10px;padding:8px 12px;background:#f5223b;color:#fff3d4;cursor:pointer;">重新打开</button>
          <button id="battle-error-close" style="border:1px solid rgba(255,255,255,0.24);border-radius:10px;padding:8px 12px;background:#1d2230;color:#fff3d4;cursor:pointer;">先关闭</button>
        </div>
      </div>
    `;
    body.querySelector<HTMLButtonElement>('#battle-error-retry')?.addEventListener('click', () => {
      iframe?.[0]?.contentWindow?.location.reload();
    });
    body.querySelector<HTMLButtonElement>('#battle-error-close')?.addEventListener('click', () => {
      destroyWindow();
      syncLauncherState();
      invokeBattleWindowControls(CLOSE, [window.parent, window.top]);
    });
  }
  if (typeof toastr !== 'undefined') {
    toastr.error(message, '战斗浮窗启动失败');
  }
}

function syncLauncherState() {
  if (!launcher) {
    return;
  }
  launcher.find('button').text(isWindowVisible() ? '收起战斗' : '战斗');
}

function showWindow() {
  iframe?.css('display', 'block');
  syncLauncherState();
}

function hideWindow() {
  iframe?.css('display', 'none');
  syncLauncherState();
}

function destroyWindow() {
  clearMountRetry();
  app?.unmount();
  app = null;
  styleHandle?.destroy();
  styleHandle = null;
  iframe?.remove();
  iframe = null;
  mounted = false;
}

function scheduleMount(frame: HTMLIFrameElement, retries = 40) {
  clearMountRetry();

  const attemptMount = async () => {
    if (mounted || iframe?.[0] !== frame) {
      return;
    }

    const document = frame.contentDocument;
    const body = document?.body;
    const head = document?.head;
    if (!body || !head) {
      if (retries <= 0) {
        reportLaunchError(new Error('battle iframe did not initialize correctly'));
        destroyWindow();
        syncLauncherState();
        return;
      }
      mountRetryTimer = setTimeout(() => scheduleMount(frame, retries - 1), 50);
      return;
    }

    try {
      body.style.margin = '0';
      body.style.minHeight = '100vh';
      body.style.background = 'rgba(248, 246, 240, 0.98)';
      body.style.color = '#2f3429';
      body.style.fontFamily = `'Segoe UI', 'Microsoft YaHei UI', sans-serif`;
      body.innerHTML =
        '<div id="app" style="display:block;min-height:100vh;box-sizing:border-box;color:#2f3429;">正在加载战斗浮窗...</div>';
      styleHandle = teleportStyle(head);
      app = await mountBattleWindowApp(body.querySelector('#app')!);
      mounted = true;
      showWindow();
    } catch (error) {
      reportLaunchError(error);
      mounted = false;
      showWindow();
      syncLauncherState();
    }
  };

  void attemptMount();
}

function openWindow() {
  ensureLauncherMounted();
  if (iframe && isIframeAppHealthy()) {
    showWindow();
    return;
  }

  if (iframe) {
    destroyWindow();
  }

  const nextIframe = ($('<iframe>') as JQuery<HTMLIFrameElement>)
    .attr({
      script_id: getScriptId(),
      'data-script-id': getScriptId(),
      frameborder: 0,
      srcdoc: BATTLE_IFRAME_SRCDOC,
    })
    .attr('title', '旅法师战斗浮窗')
    .css({
      position: 'fixed',
      right: '18px',
      bottom: '120px',
      width: 'min(420px, calc(100vw - 32px))',
      height: 'min(520px, calc(100vh - 150px))',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100vh - 82px)',
      border: '1px solid rgba(151,145,132,0.42)',
      borderRadius: '18px',
      overflow: 'hidden',
      zIndex: 9999,
      boxShadow: '0 24px 70px rgba(48, 45, 39, 0.28)',
      background: 'rgba(248, 246, 240, 0.98)',
      display: 'block',
    })
    .one('load', () => {
      scheduleMount(nextIframe[0]);
    });

  iframe = nextIframe.appendTo('body');
  syncLauncherState();
}

function ensureLauncherMounted() {
  if (launcher) {
    return launcher;
  }

  const button = $('<button>')
    .attr('type', 'button')
    .text('战斗')
    .css({
      border: '1px solid rgba(148,163,184,0.35)',
      borderRadius: '999px',
      padding: '9px 14px',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))',
      color: '#e2e8f0',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      boxShadow: '0 12px 32px rgba(2, 6, 23, 0.35)',
    })
    .on('click', () => {
      if (isWindowVisible()) {
        hideWindow();
        return;
      }
      openWindow();
    });

  launcher = createScriptIdDiv()
    .attr('data-script-id', getScriptId())
    .attr('data-role', 'battle-launcher')
    .css({
      position: 'fixed',
      right: '24px',
      bottom: '24px',
      zIndex: 9998,
    })
    .append(button)
    .appendTo('body');

  syncLauncherState();
  return launcher;
}

function handleMessage(event: MessageEvent<{ type?: string }>) {
  const type = event.data?.type;
  if (type === OPEN) {
    openWindow();
  }
  if (type === CLOSE) {
    destroyWindow();
    syncLauncherState();
  }
}

function initBattleWindowHost() {
  (window as BattleWindowControlHost)[OPEN_CONTROL] = openWindow;
  (window as BattleWindowControlHost)[CLOSE_CONTROL] = () => {
    destroyWindow();
    syncLauncherState();
  };
  ensureLauncherMounted();
  window.addEventListener('message', handleMessage);

  $(window).on('pagehide', () => {
    delete (window as BattleWindowControlHost)[OPEN_CONTROL];
    delete (window as BattleWindowControlHost)[CLOSE_CONTROL];
    window.removeEventListener('message', handleMessage);
    destroyWindow();
    launcher?.remove();
    launcher = null;
  });
}

$(() => {
  if (typeof errorCatched === 'function') {
    errorCatched(initBattleWindowHost)();
    return;
  }
  initBattleWindowHost();
});
