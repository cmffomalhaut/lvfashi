import App from './App.vue';
import './global.css';

$(() => {
  errorCatched(async () => {
    await waitGlobalInitialized('Mvu');
    createApp(App).use(createPinia()).mount('#app');
  })();
});
