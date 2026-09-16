// Flat config, checked in so `npm run lint` works offline: `expo lint` reaches
// out to Expo's API on first run to fetch one.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['dist/**', '.expo/**', 'node_modules/**', 'ios/**', 'android/**'] },
];
