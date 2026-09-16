// Metro, taught about the monorepo.
//
// The application imports @eisman/shared and @eisman/api-client from outside
// its own directory, so Metro has to watch the repository root and resolve
// modules from both node_modules trees.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays on: several Expo packages keep their own
// dependencies nested, and turning it off makes those unresolvable. npm
// hoists react and react-native to the repository root, so there is still only
// one copy of each.

module.exports = config;
