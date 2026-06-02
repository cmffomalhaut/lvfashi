import type { App as VueApp } from 'vue';
import App from './App.vue';
import './global.css';

const OPEN = 'planeswalker:battle:open';
const CLOSE = 'planeswalker:battle:close';
const OPEN_CONTROL = '__planeswalkerBattleWindowOpen';
const CLOSE_CONTROL = '__planeswalkerBattleWindowClose';

type BattleWindowControlHost = Window & {
  [OPEN_CONTROL]?: () => void;
  [CLOSE_CONTROL]?: () => void;
};

function invokeBattleWindowControl(type: typeof OPEN | typeof CLOSE, hostWindow: Window | null | undefined) {
  if (!hostWindow) {
    return;
  }
  const controlHost = hostWindow as BattleWindowControlHost;
  if (type === OPEN) {
    controlHost[OPEN_CONTROL]?.();
  } else {
    controlHost[CLOSE_CONTROL]?.();
  }
  hostWindow.postMessage({ type }, '*');
}

function renderFatalError(host: Element, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  host.innerHTML = `
    <div style="min-height:100vh;box-sizing:border-box;padding:20px;background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.98));color:#fecaca;font:14px/1.6 'Segoe UI','Microsoft YaHei UI',sans-serif;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#fecaca;">战斗浮窗运行失败</h2>
      <pre style="margin:0;white-space:pre-wrap;word-break:break-word;">${String(message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
        <button id="battle-fatal-retry" style="border:1px solid rgba(255,255,255,0.24);border-radius:10px;padding:8px 12px;background:#f5223b;color:#fff3d4;cursor:pointer;">重新打开</button>
        <button id="battle-fatal-close" style="border:1px solid rgba(255,255,255,0.24);border-radius:10px;padding:8px 12px;background:#1d2230;color:#fff3d4;cursor:pointer;">返回主界面</button>
      </div>
    </div>
  `;
  host.querySelector<HTMLButtonElement>('#battle-fatal-retry')?.addEventListener('click', () => {
    window.location.reload();
  });
  host.querySelector<HTMLButtonElement>('#battle-fatal-close')?.addEventListener('click', () => {
    const frame = window.frameElement as HTMLElement | null;
    if (frame) {
      frame.style.display = 'none';
    }
    invokeBattleWindowControl(CLOSE, window.parent);
    invokeBattleWindowControl(CLOSE, window.top);
  });
}

export async function mountBattleWindowApp(host: Element): Promise<VueApp> {
  const app = createApp(App).use(createPinia());
  let didMount = false;
  app.config.errorHandler = error => {
    console.error('[planeswalker.battle-window] 运行失败', error);
    if (!didMount) {
      renderFatalError(host, error);
    }
  };
  app.mount(host);
  didMount = true;
  return app;
}
