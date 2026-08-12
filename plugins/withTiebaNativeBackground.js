const { withInfoPlist } = require('@expo/config-plugins');

const TASK_IDS = [
  'com.tiebalite.app.notification-sync',
  'com.tiebalite.app.auto-sign',
];

module.exports = function withTiebaNativeBackground(config) {
  return withInfoPlist(config, (cfg) => {
    const existing = cfg.modResults.BGTaskSchedulerPermittedIdentifiers ?? [];
    const merged = Array.from(new Set([...existing, ...TASK_IDS]));
    cfg.modResults.BGTaskSchedulerPermittedIdentifiers = merged;
    return cfg;
  });
};
