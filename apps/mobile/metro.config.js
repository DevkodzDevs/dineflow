// Monorepo-aware Metro config so @dineflow/shared resolves from the workspace root.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const root = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules"), path.resolve(root, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
// tsconfig maps `react` to @types/react so the phone app type-checks against React 18 typings;
// that mapping is for TypeScript only — Metro must always bundle the real package.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, name, platform) => {
  if (name === "react" || name.startsWith("react/")) {
    const real = require.resolve(name === "react" ? "react" : name, { paths: [__dirname, root] });
    return { type: "sourceFile", filePath: real };
  }
  return defaultResolve ? defaultResolve(ctx, name, platform) : ctx.resolveRequest(ctx, name, platform);
};
module.exports = config;
