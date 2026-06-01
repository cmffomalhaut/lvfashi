const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

<<<<<<< HEAD
export const useSettingsStore = defineStore('脚本示例', () => {
=======
export const useSettingsStore = defineStore('settings', () => {
>>>>>>> 1b593ab69d89d2d5d22e9730e0163f19dd209fac
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
