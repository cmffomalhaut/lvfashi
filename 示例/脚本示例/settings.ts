const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

<<<<<<< HEAD
export const useSettingsStore = defineStore('脚本示例', () => {
=======
export const useSettingsStore = defineStore('settings', () => {
>>>>>>> fe7d6686eaa214f144c2a734be2e26ca399f3d3d
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watchEffect(() => {
    insertOrAssignVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  return { settings };
});
