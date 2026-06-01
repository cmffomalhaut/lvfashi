import type { App as VueApp } from 'vue';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { mountBattleWindowApp } from '../../界面/战斗浮窗/index';

const OPEN = 'planeswalker:battle:open';
const CLOSE = 'planeswalker:battle:close';
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
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(17, 24, 39, 0.98));
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

function isWindowVisible(): boolean {
  return Boolean(iframe?.is(':visible'));
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
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;">${_.escape(message)}</pre>
      </div>
    `;
  }
  if (typeof toastr !== 'undefined') {
    toastr.error(message, '战斗浮窗启动失败');
  }
}

function syncLauncherState() {
  if (!launcher) {
    return;
  }

  launcher.find('button').text(isWindowVisible() ? '隐藏战斗浮窗' : '打开战斗浮窗');
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
      body.style.background = 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98))';
      body.style.color = '#e2e8f0';
      body.style.fontFamily = `'Segoe UI', 'Microsoft YaHei UI', sans-serif`;
      body.innerHTML =
        '<div id="app" style="display:block;min-height:100vh;box-sizing:border-box;padding:14px;color:#e2e8f0;">正在加载战斗浮窗...</div>';
      styleHandle = teleportStyle(head);
      app = await mountBattleWindowApp(body.querySelector('#app')!);
      mounted = true;
      showWindow();
    } catch (error) {
      reportLaunchError(error);
      destroyWindow();
      syncLauncherState();
    }
  };

  void attemptMount();
}

function openWindow() {
  ensureLauncherMounted();
  if (mounted && iframe) {
    showWindow();
    return;
  }

  if (iframe && !mounted) {
    destroyWindow();
  }

  const nextIframe = ($('<iframe>') as JQuery<HTMLIFrameElement>)
    .attr({
      script_id: getScriptId(),
      frameborder: 0,
      srcdoc: BATTLE_IFRAME_SRCDOC,
    })
    .attr('title', '旅法师战斗浮窗')
    .css({
      position: 'fixed',
      right: '24px',
      bottom: '76px',
      width: '560px',
      height: '720px',
      border: '1px solid rgba(148,163,184,0.35)',
      borderRadius: '16px',
      overflow: 'hidden',
      zIndex: 9999,
      boxShadow: '0 24px 60px rgba(2, 6, 23, 0.55)',
      background: 'transparent',
      display: 'block',
    })
    .on('load', () => {
      scheduleMount(nextIframe[0]);
    });

  iframe = nextIframe.appendTo('body');
  syncLauncherState();
  scheduleMount(nextIframe[0]);
}

function ensureLauncherMounted() {
  if (launcher) {
    return launcher;
  }

  const button = $('<button>')
    .attr('type', 'button')
    .text('打开战斗浮窗')
    .css({
      border: '1px solid rgba(148,163,184,0.35)',
      borderRadius: '999px',
      padding: '10px 16px',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(30,41,59,0.96))',
      color: '#e2e8f0',
      fontSize: '13px',
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
    hideWindow();
  }
}

$(() => {
  ensureLauncherMounted();
  window.addEventListener('message', handleMessage);

  $(window).on('pagehide', () => {
    window.removeEventListener('message', handleMessage);
    destroyWindow();
    launcher?.remove();
    launcher = null;
  });
});
