const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Zustand web compatibility.
 *
 * zustand v4 publishes an ESM build whose dev branches read `import.meta.env`.
 * Metro's web bundle is served as a classic script, so `import.meta` is a hard
 * syntax error there and the whole app fails to boot in the browser.
 *
 * zustand already ships a clean CommonJS build under its "react-native" export
 * condition, so rather than downgrading the library or dropping it, we resolve
 * zustand through that condition on web as well. Native is unaffected — it
 * already picks this build.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ['react-native', 'require', 'default'] },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

/**
 * Bundle the vehicle model as a binary asset.
 *
 * Metro does not treat `.glb` as an asset by default, so `require()` of the
 * model would otherwise be parsed as JavaScript and fail the build.
 */
config.resolver.assetExts = [...config.resolver.assetExts, 'glb', 'gltf'];

module.exports = config;
