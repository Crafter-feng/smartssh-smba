/**
 * 命令模块索引
 * 统一导出所有命令模块
 */
const serverCommands = require('./server');
const commandCommands = require('./command');

/**
 * 注册所有命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @param {Object} providers - 提供者对象
 * @param {Object} providers.commandTreeProvider - 命令树提供者
 * @param {Object} providers.serverTreeProvider - 服务器树提供者
 */
function registerAll(context, providers = {}) {
  // 注册服务器管理命令
  serverCommands.register(context, providers.serverTreeProvider);

  // 注册命令管理命令
  commandCommands.register(context, providers.commandTreeProvider, providers.serverTreeProvider);
}

module.exports = {
  registerAll,
  server: serverCommands,
  command: commandCommands,
};
