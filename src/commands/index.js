/**
 * 命令模块索引
 * 统一导出所有命令模块
 */

const connectionCommands = require('./connection');
const serverCommands = require('./server');
const commandCommands = require('./command');

/**
 * 注册所有命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function registerAll(context) {
  // 注册连接相关命令
  connectionCommands.register(context);

  // 注册服务器管理命令
  serverCommands.register(context);

  // 注册命令管理命令
  commandCommands.register(context);
}

module.exports = {
  registerAll,
  connection: connectionCommands,
  server: serverCommands,
  command: commandCommands,
};