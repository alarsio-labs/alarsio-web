// Builds the Android app for real phones only (ARM), not for x86 emulators. The pilot APK
// carried all four architectures, about 15 MB of x86 code no supervisor's phone can run,
// on a 109 MB download over site data. Emulators still run debug builds from `expo run`.
const { withGradleProperties } = require('expo/config-plugins');

const ARCHITECTURES = 'armeabi-v7a,arm64-v8a';

module.exports = function withArmOnly(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'));
    cfg.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: ARCHITECTURES });
    return cfg;
  });
};

module.exports.ARCHITECTURES = ARCHITECTURES;
