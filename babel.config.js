module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Path alias "@/*" is resolved by expo/metro-config directly from tsconfig.json
    // "paths", so no module-resolver plugin is required.
    plugins: ['react-native-worklets/plugin'],
  };
};
