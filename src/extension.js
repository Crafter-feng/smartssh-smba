/* eslint-disable @stylistic/comma-dangle */

const vscode = require('vscode');
const { logger } = require('./utils/logger');
const commands = require('./commands');
const statusBar = require('./ui/status-bar');
const { ServerTreeProvider } = require('./ui/tree-view/server-provider');
const { CommandTreeProvider } = require('./ui/tree-view/command-provider');
const configLoader = require('./adapters/config-loader');
const terminalLinks = require('./ui/terminal-links');

/**
 * 扩展激活入口点
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {Object} - 扩展 API
 */
function activate(context) {
  try {
    // 初始化日志
    logger.info('扩展正在启动...');

    // 初始化状态栏
    statusBar.initialize(context);

    // 初始化树视图提供者
    const serverTreeProvider = new ServerTreeProvider(context);
    const commandTreeProvider = new CommandTreeProvider(context);

    // 将服务器列表设为全局变量，以便树视图提供者可以访问
    const servers = [];
    global.servers = servers;

    // 注册树视图
    const serverTreeView = vscode.window.createTreeView('smartssh-smba-servers', {
      treeDataProvider: serverTreeProvider,
      showCollapseAll: true,
    });

    const commandTreeView = vscode.window.createTreeView('smartssh-smba-commands', {
      treeDataProvider: commandTreeProvider,
      showCollapseAll: true,
    });

    // 注册命令
    commands.registerAll(context, {
      serverTreeProvider,
      commandTreeProvider
    });

    // 监听配置变更
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('smartssh-smba')) {
          // 刷新配置缓存
          configLoader.refreshCache();

          // 刷新树视图
          serverTreeProvider.refresh();
          commandTreeProvider.refresh();

          logger.info('配置已更新，刷新视图');
        }
      })
    );

    // 注册文件路径点击处理
    terminalLinks.registerAll(context);

    // 加载初始服务器列表
    serverTreeProvider.refresh();
    commandTreeProvider.refresh();

    logger.info('扩展已成功激活');

    // 返回扩展API
    return {
      getTerminals: function () {
        return require('./services/terminal-manager').getAllTerminals();
      }
    };
  } catch (error) {
    logger.error('激活扩展时出错:', error);
    vscode.window.showErrorMessage(`激活 SmartSSH-SMBA 扩展时出错: ${error.message}`);
  }
}

/**
 * 扩展停用入口点
 */
function deactivate() {
  logger.info('扩展已停用');
}

module.exports = {
  activate,
  deactivate
};
