/**
 * 服务器管理命令模块
 * 处理所有与服务器管理相关的命令
 */

const vscode = require('vscode');
const configLoader = require('../adapters/config-loader');
const { logger } = require('../utils/logger');

/**
 * 添加服务器
 */
async function addServer() {
  try {
    // 获取服务器信息
    const name = await vscode.window.showInputBox({
      placeHolder: '服务器名称',
      prompt: '输入服务器名称'
    });
    
    if (!name) return;
    
    const host = await vscode.window.showInputBox({
      placeHolder: '主机名/IP地址',
      prompt: '输入主机名或IP地址'
    });
    
    if (!host) return;
    
    const username = await vscode.window.showInputBox({
      placeHolder: '用户名',
      prompt: '输入SSH用户名'
    });
    
    if (!username) return;
    
    const port = await vscode.window.showInputBox({
      placeHolder: '端口号 (默认: 22)',
      prompt: '输入SSH端口号',
      value: '22'
    });
    
    // 创建服务器配置
    const server = {
      name,
      host,
      username,
      port: parseInt(port || '22', 10)
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
    // 刷新服务器树视图
    vscode.commands.executeCommand('smartssh-smba-servers.refresh');
  } catch (error) {
    logger.error(`刷新服务器列表时出错: ${error.message}`);
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
    
    // 创建选择项
    const items = serverList.map(server => ({
      label: server.name,
      description: `${server.username}@${server.host}`
    }));
    
    // 显示快速选择
    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: '选择一个服务器'
    });
    
    return selection ? selection.label : null;
  } catch (error) {
    logger.error(`选择服务器时出错: ${error.message}`);
    return null;
  }
}

/**
 * 注册服务器管理命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function register(context) {
  // 添加服务器
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.addServer', addServer)
  );
  
  // 编辑服务器
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.editServer', editServer)
  );
  
  // 删除服务器
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.deleteServer', deleteServer)
  );
  
  // 刷新服务器列表
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.refreshServerList', refreshServerList)
  );
}

module.exports = {
  addServer,
  editServer,
  deleteServer,
  refreshServerList,
  register
}; 