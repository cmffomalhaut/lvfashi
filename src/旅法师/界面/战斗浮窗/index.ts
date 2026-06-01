import type { App as VueApp } from 'vue';
import App from './App.vue';
import './global.css';

function renderFatalError(host: Element, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  host.innerHTML = `
    <div style="min-height:100vh;box-sizing:border-box;padding:20px;background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.98));color:#fecaca;font:14px/1.6 'Segoe UI','Microsoft YaHei UI',sans-serif;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#fecaca;">战斗浮窗运行失败</h2>
      <pre style="margin:0;white-space:pre-wrap;word-break:break-word;">${String(message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</pre>
    </div>
  `;
}

export async function mountBattleWindowApp(host: Element): Promise<VueApp> {
  const app = createApp(App).use(createPinia());
  app.config.errorHandler = error => {
    console.error('[planeswalker.battle-window] 运行失败', error);
    renderFatalError(host, error);
  };
  app.mount(host);
  return app;
}
