const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../frontend/src/api')];
// The shared file is pure TypeScript; resolve runtime packages from mobile only.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// Keep normal lookup enabled for pnpm's isolated transitive dependencies.
module.exports = config;
