import type { App as VueApp } from 'vue';
import { createScriptIdIframe, registerAsUniqueScript, teleportStyle } from '@util/script';
import { mountBattleWindowApp } from '../../界面/战斗浮窗/index';

const OPEN = 'planeswalker:battle:open';
const CLOSE = 'planeswalker:battle:close';

let app: VueApp | null = null;
let iframe: JQuery<HTMLIFrameElement> | null = null;
let styleHandle: { destroy: () => void } | null = null;
let mounted = false;

function showWindow() {
  iframe?.show();
}

function hideWindow() {
  iframe?.hide();
}

async function ensureWindowMounted() {
  if (!iframe) {
    iframe = createScriptIdIframe()
      .attr('title', '旅法师战斗浮窗')
      .css({
        position: 'fixed',
        right: '24px',
        bottom: '24px',
        width: '560px',
        height: '720px',
        border: '1px solid rgba(148,163,184,0.35)',
        borderRadius: '16px',
        overflow: 'hidden',
        zIndex: 9999,
        boxShadow: '0 24px 60px rgba(2, 6, 23, 0.55)',
        background: 'transparent',
        display: 'none',
      })
      .appendTo('body');
  }

  if (mounted) {
    showWindow();
    return;
  }

  const frame = iframe[0];
  await new Promise<void>(resolve => {
    if (frame.contentDocument?.readyState === 'complete') {
      resolve();
      return;
    }
    iframe!.one('load', () => resolve());
  });

  const body = frame.contentDocument?.body;
  const head = frame.contentDocument?.head;
  if (!body || !head) {
    throw new Error('battle iframe did not initialize correctly');
  }

  body.innerHTML = '<div id="app"></div>';
  styleHandle = teleportStyle(head);
  app = await mountBattleWindowApp(body.querySelector('#app')!);
  mounted = true;
  showWindow();
}

function handleMessage(event: MessageEvent<{ type?: string }>) {
  const type = event.data?.type;
  if (type === OPEN) {
    errorCatched(async () => {
      await ensureWindowMounted();
    })();
  }
  if (type === CLOSE) {
    hideWindow();
  }
}

$(() => {
  const unique = registerAsUniqueScript('planeswalker.battle-window');
  if (unique.getPreferredScriptId() !== getScriptId()) {
    return;
  }

  window.addEventListener('message', handleMessage);

  $(window).on('pagehide', () => {
    window.removeEventListener('message', handleMessage);
    app?.unmount();
    app = null;
    styleHandle?.destroy();
    styleHandle = null;
    iframe?.remove();
    iframe = null;
    mounted = false;
    unique.unregister();
  });
});
