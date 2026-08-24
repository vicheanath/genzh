const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  '@genzh/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

/**
 * Packages there must be exactly one copy of in the bundle.
 *
 * React and React Query both keep module-level state — the hook dispatcher and
 * the query-client context — so a second copy does not merely waste bytes, it
 * silently fails: hooks called through the second React see a null dispatcher
 * ("Invalid hook call"), and a `useQuery` from the second React Query reads a
 * context the app's provider never filled in ("Cannot read property
 * 'useContext' of null").
 *
 * This is easy to hit here specifically. `@genzh/shared` ships raw TypeScript
 * rather than a build, so Metro bundles its files *in place*, and Node
 * resolution walks up from `packages/shared/src/…` — where pnpm's isolated
 * layout has put `packages/shared/node_modules/react`, installed as a
 * devDependency for the package's own typecheck. It resolved to 19.2.8 while
 * the app pins 19.1.0.
 *
 * `nodeModulesPaths` above does not prevent this: it adds fallbacks for
 * failed lookups, it does not stop a lookup that succeeds closer to the
 * importing file.
 */
const SINGLETONS = ['react', 'react-dom', 'react-native', '@tanstack/react-query'];

function singletonFor(moduleName) {
  return SINGLETONS.find(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
}

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;

  if (singletonFor(moduleName)) {
    // Resolve as though the import came from the app itself, so the lookup
    // starts at `apps/mobile/node_modules` no matter who asked. Rewriting
    // `originModulePath` rather than resolving to a file path by hand keeps
    // Metro's platform extensions (`.native.js`, `.ios.js`) working, which a
    // `require.resolve` would bypass.
    return resolve(
      { ...context, originModulePath: path.join(projectRoot, 'index.ts') },
      moduleName,
      platform,
    );
  }

  return resolve(context, moduleName, platform);
};

config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
  'cjs',
];

module.exports = config;
