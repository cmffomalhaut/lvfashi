const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

<<<<<<< HEAD
export const useSettingsStore = defineStore('脚本示例', () => {
=======
export const useSettingsStore = defineStore('settings', () => {
>>>>>>> c5efcd76bf56ff7466cc36a0a02eea9e070a25de
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
