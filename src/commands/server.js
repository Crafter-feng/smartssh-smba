/**
 * 服务器管理命令模块
 * 处理所有与服务器管理相关的命令
 */

const vscode = require('vscode');
const configLoader = require('../adapters/config-loader');
const { logger } = require('../utils/logger');
const { ServerTreeProvider } = require('../ui/tree-view/server-provider');
const terminalManager = require('../services/terminal-manager');

// 服务器树提供者实例，在register函数中初始化
let serverTreeProvider;

/**
 * 添加服务器
 */
async function addServer() {
  try {
    // 获取服务器信息
    const name = await vscode.window.showInputBox({
      placeHolder: '服务器名称',
      prompt: '输入服务器名称',
    });

    if (!name) return;

    const host = await vscode.window.showInputBox({
      placeHolder: '主机名/IP地址',
      prompt: '输入主机名或IP地址',
    });

    if (!host) return;

    const username = await vscode.window.showInputBox({
      placeHolder: '用户名',
      prompt: '输入SSH用户名',
    });

    if (!username) return;

    const port = await vscode.window.showInputBox({
      placeHolder: '端口号 (默认: 22)',
      prompt: '输入SSH端口号',
      value: '22',
    });

    // 创建服务器配置
    const server = {
      name,
      host,
      username,
      port: parseInt(port || '22', 10),
    };

    // 保存服务器
    const result = await configLoader.addServer(server);

    if (result) {
      vscode.window.showInformationMessage(`服务器 ${name} 已添加`);

      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshServerList');
    } else {
      vscode.window.showErrorMessage(`添加服务器 ${name} 失败`);
    }
  } catch (error) {
    logger.error(`添加服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`添加服务器时出错: ${error.message}`);
  }
}

/**
 * 编辑服务器
 * @param {Object} server - 服务器对象
 */
async function editServer(server) {
  try {
    if (!server) {
      // 选择一个服务器进行编辑
      const serverName = await selectServerForEdit();
      if (!serverName) return;

      // 获取服务器配置
      const servers = configLoader.getServerList();
      server = servers.find(s => s.name === serverName);
    }

    if (!server) {
      vscode.window.showErrorMessage('找不到服务器配置');
      return;
    }

    // 打开设置文件编辑
    await configLoader.openServerSettings();
  } catch (error) {
    logger.error(`编辑服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`编辑服务器时出错: ${error.message}`);
  }
}

/**
 * 删除服务器
 * @param {Object} server - 服务器对象
 */
async function deleteServer(server) {
  try {
    if (!server) {
      // 选择一个服务器进行删除
      const serverName = await selectServerForEdit();
      if (!serverName) return;

      // 获取服务器配置
      const servers = configLoader.getServerList();
      server = servers.find(s => s.name === serverName);
    }

    if (!server) {
      vscode.window.showErrorMessage('找不到服务器配置');
      return;
    }

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除服务器 ${server.name} 吗?`,
      { modal: true },
      '确定',
      '取消'
    );

    if (confirm !== '确定') return;

    // 删除服务器
    const result = await configLoader.deleteServer(server.name);

    if (result) {
      vscode.window.showInformationMessage(`服务器 ${server.name} 已删除`);

      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshServerList');
    } else {
      vscode.window.showErrorMessage(`删除服务器 ${server.name} 失败`);
    }
  } catch (error) {
    logger.error(`删除服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除服务器时出错: ${error.message}`);
  }
}

/**
 * 刷新服务器列表
 */
function refreshServerList() {
  try {
    configLoader.refreshCache();
    serverTreeProvider.refresh();
    vscode.window.showInformationMessage('服务器列表已刷新');
  } catch (error) {
    logger.error(`刷新服务器列表失败: ${error.message}`);
    vscode.window.showErrorMessage(`刷新服务器列表失败: ${error.message}`);
  }
}

/**
 * 选择服务器
 * @returns {Promise<string|null>} 服务器名称，如果用户取消则返回null
 */
async function selectServerForEdit() {
  try {
    // 获取服务器列表
    const serverList = configLoader.getServerList();

    if (!serverList || serverList.length === 0) {
      vscode.window.showInformationMessage('没有配置服务器，请先添加服务器');
      return null;
    }

    if (serverList.length === 1) {
      return serverList[0].name;
    }

    // 创建选择项
    const items = serverList.map(server => ({
      label: server.name,
      description: `${server.username}@${server.host}`,
    }));

    // 显示快速选择
    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: '选择一个服务器',
    });

    return selection ? selection.label : null;
  } catch (error) {
    logger.error(`选择服务器时出错: ${error.message}`);
    return null;
  }
}

/**
 * 连接到服务器
 * @param {string|Object} server - 服务器名称或服务器对象
 */
async function connectToServer(server) {
  try {
    // 判断参数类型
    let serverName = null;

    if (typeof server === 'string') {
      // 如果 server 是字符串（服务器名称），直接使用
      serverName = server;
    } else if (server && typeof server === 'object') {
      // 根据不同对象类型获取服务器名称
      if (server.name) {
        // 如果 server 是服务器配置且有 name 属性
        serverName = server.name;
      } else if (server.label) {
        // 如果 server 是 QuickPickItem 且有 label 属性
        serverName = server.label;
      } else if (server.server && server.server.name) {
        // 如果 server 是树项且有 server.name 属性 (新实现)
        serverName = server.server.name;
      } else if (server.configuration && server.configuration.name) {
        // 如果 server 是树项且有 configuration.name 属性 (旧实现)
        serverName = server.configuration.name;
      }
    }

    logger.info(`准备连接到服务器: ${serverName || '选择服务器'}`);
    await terminalManager.connectToServer(serverName);
  } catch (error) {
    logger.error(`连接到服务器失败: ${error.message}`);
    vscode.window.showErrorMessage(`连接到服务器失败: ${error.message}`);
  }
}

/**
 * 快速打开SSH连接
 */
async function fastOpenConnection() {
  try {
    logger.info('准备快速打开SSH连接');
    await terminalManager.connectToServer();
  } catch (error) {
    logger.error(`快速打开SSH连接失败: ${error.message}`);
    vscode.window.showErrorMessage(`快速打开SSH连接失败: ${error.message}`);
  }
}

/**
 * 注册服务器管理命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @param {ServerTreeProvider} treeProvider - 服务器树提供者实例
 */
function register(context, treeProvider) {
  // 保存服务器树提供者实例
  serverTreeProvider = treeProvider;
}

module.exports = {
  addServer,
  editServer,
  deleteServer,
  refreshServerList,
  connectToServer,
  fastOpenConnection,
  register,
};
