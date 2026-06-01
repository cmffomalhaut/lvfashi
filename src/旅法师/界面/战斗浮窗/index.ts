import type { App as VueApp } from 'vue';
import App from './App.vue';
import './global.css';

export async function mountBattleWindowApp(host: Element): Promise<VueApp> {
  await waitGlobalInitialized('Mvu');
  const app = createApp(App).use(createPinia());
  app.mount(host);
  return app;
}
