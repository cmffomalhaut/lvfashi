const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

<<<<<<< HEAD
export const useSettingsStore = defineStore('脚本示例', () => {
=======
export const useSettingsStore = defineStore('settings', () => {
>>>>>>> 24c09dd0d2e3a345ced6bd6449ff0c89cd686543
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
