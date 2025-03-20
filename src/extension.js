/* eslint-disable no-useless-escape */
/* eslint-disable @stylistic/brace-style */
/* eslint-disable @stylistic/comma-dangle */

const vscode = require('vscode');
const { logger } = require('../adapters/logger');
const commands = require('./commands');
const statusBar = require('./ui/status-bar');
const { ServerTreeProvider } = require('./ui/tree-view/server-provider');
const { CommandTreeProvider } = require('./ui/tree-view/command-provider');
const configLoader = require('../adapters/config-loader');

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
    
    // 初始化树视图
    const serverTreeProvider = new ServerTreeProvider();
    const commandTreeProvider = new CommandTreeProvider();
    
    // 将服务器列表设为全局变量，以便树视图提供者可以访问
    const servers = [];
    global.servers = servers;
    
    // 注册树视图
    const serversTreeView = vscode.window.createTreeView('smartssh-smba-servers', {
      treeDataProvider: serverTreeProvider,
      showCollapseAll: true,
    });
    
    const commandsTreeView = vscode.window.createTreeView('smartssh-smba-commands', {
      treeDataProvider: commandTreeProvider,
    });
    
    // 注册命令
    commands.registerAll(context);
    
    // 设置配置监视器
    setupConfigWatchers(context);
    
    // 注册文件路径点击处理
    registerFilePathClickHandler(context);
    
    // 加载服务器列表
    loadServerList();
    
    logger.info('扩展已成功激活');
    
    // 返回扩展API
    return {
      getTerminals: function() {
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

// 这些函数将在后续重构中移动到各自的模块
// 暂时保留为占位符，直到完全重构
function setupConfigWatchers(context) {
  // TODO: 移到适当的模块
}

function registerFilePathClickHandler(context) {
  // TODO: 移到适当的模块
}

function loadServerList() {
  // TODO: 移到适当的模块
}

module.exports = {
  activate,
  deactivate
}; 