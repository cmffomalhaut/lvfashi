const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

<<<<<<< HEAD
export const useSettingsStore = defineStore('脚本示例', () => {
=======
export const useSettingsStore = defineStore('settings', () => {
>>>>>>> 554b225f1325def871e7754811cd8f71ba9a8169
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
