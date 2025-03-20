/**
 * 命令管理模块
 * 处理所有与命令管理相关的功能
 */

const vscode = require('vscode');
const configLoader = require('../../adapters/config-loader');
const terminalManager = require('../services/terminal-manager');
const { logger } = require('../../adapters/logger');

/**
 * 添加命令
 * @param {string} type - 命令类型（global/workspace）
 */
async function addCommand(type = 'global') {
  try {
    // 获取命令信息
    const name = await vscode.window.showInputBox({
      placeHolder: '命令名称',
      prompt: '输入命令名称',
    });
    
    if (!name) return;
    
    const command = await vscode.window.showInputBox({
      placeHolder: '命令内容',
      prompt: '输入命令内容',
    });
    
    if (!command) return;
    
    const description = await vscode.window.showInputBox({
      placeHolder: '命令描述 (可选)',
      prompt: '输入命令描述',
    });
    
    // 创建命令对象
    const cmd = {
      name,
      command,
      description,
    };
    
    // 保存命令
    let result;
    if (type === 'workspace') {
      result = await configLoader.addWorkspaceCommand(cmd);
    } else {
      result = await configLoader.addGlobalCommand(cmd);
    }
    
    if (result) {
      vscode.window.showInformationMessage(`命令 ${name} 已添加`);
      
      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshCommandList');
    } else {
      vscode.window.showErrorMessage(`添加命令 ${name} 失败`);
    }
  } catch (error) {
    logger.error(`添加命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`添加命令时出错: ${error.message}`);
  }
}

/**
 * 添加全局命令
 */
async function addGlobalCommand() {
  await addCommand('global');
}

/**
 * 添加工作区命令
 */
async function addWorkspaceCommand() {
  await addCommand('workspace');
}

/**
 * 编辑命令
 * @param {Object} commandItem - 命令项
 */
async function editCommand(commandItem) {
  try {
    if (!commandItem || !commandItem.command) {
      vscode.window.showErrorMessage('无效的命令');
      return;
    }
    
    // 获取命令信息
    const name = await vscode.window.showInputBox({
      placeHolder: '命令名称',
      prompt: '输入命令名称',
      value: commandItem.command.name || ''
    });
    
    if (name === undefined) return;
    
    const command = await vscode.window.showInputBox({
      placeHolder: '命令内容',
      prompt: '输入命令内容',
      value: commandItem.command.command || ''
    });
    
    if (command === undefined) return;
    
    const description = await vscode.window.showInputBox({
      placeHolder: '命令描述 (可选)',
      prompt: '输入命令描述',
      value: commandItem.command.description || ''
    });
    
    // 创建更新后的命令对象
    const updatedCmd = {
      name,
      command,
      description
    };
    
    // 保存命令
    let result;
    const type = commandItem.contextValue;
    
    if (type === 'workspace-command') {
      result = await configLoader.updateWorkspaceCommand(commandItem.command, updatedCmd);
    } else {
      result = await configLoader.updateGlobalCommand(commandItem.command, updatedCmd);
    }
    
    if (result) {
      vscode.window.showInformationMessage(`命令 ${name} 已更新`);
      
      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshCommandList');
    } else {
      vscode.window.showErrorMessage(`更新命令 ${name} 失败`);
    }
  } catch (error) {
    logger.error(`编辑命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`编辑命令时出错: ${error.message}`);
  }
}

/**
 * 删除命令
 * @param {Object} commandItem - 命令项
 */
async function deleteCommand(commandItem) {
  try {
    if (!commandItem || !commandItem.command) {
      vscode.window.showErrorMessage('无效的命令');
      return;
    }
    
    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除命令 ${commandItem.command.name || commandItem.command.command} 吗?`,
      { modal: true },
      '确定',
      '取消'
    );
    
    if (confirm !== '确定') return;
    
    // 删除命令
    let result;
    const type = commandItem.contextValue;
    
    if (type === 'workspace-command') {
      result = await configLoader.deleteWorkspaceCommand(commandItem.command);
    } else {
      result = await configLoader.deleteGlobalCommand(commandItem.command);
    }
    
    if (result) {
      vscode.window.showInformationMessage(`命令已删除`);
      
      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshCommandList');
    } else {
      vscode.window.showErrorMessage(`删除命令失败`);
    }
  } catch (error) {
    logger.error(`删除命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除命令时出错: ${error.message}`);
  }
}

/**
 * 发送命令
 * @param {Object} commandItem - 命令项
 */
async function sendCommand(commandItem) {
  try {
    if (!commandItem || !commandItem.command || !commandItem.command.command) {
      vscode.window.showErrorMessage('无效的命令');
      return;
    }
    
    // 获取或创建本地终端
    const terminal = terminalManager.findOrCreateLocalTerminal();
    
    if (!terminal) {
      vscode.window.showErrorMessage('无法创建终端');
      return;
    }
    
    // 显示终端
    terminal.show();
    
    // 发送命令到终端
    terminal.sendText(commandItem.command.command);
  } catch (error) {
    logger.error(`发送命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`发送命令时出错: ${error.message}`);
  }
}

/**
 * 刷新命令列表
 */
function refreshCommandList() {
  try {
    // 刷新命令树视图
    vscode.commands.executeCommand('smartssh-smba-commands.refresh');
  } catch (error) {
    logger.error(`刷新命令列表时出错: ${error.message}`);
  }
}

/**
 * 注册命令管理命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function register(context) {
  // 添加命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.addCommand', addGlobalCommand)
  );
  
  // 添加全局命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.addGlobalCommand', addGlobalCommand)
  );
  
  // 添加工作区命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.addWorkspaceCommand', addWorkspaceCommand)
  );
  
  // 编辑命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.editCommand', editCommand)
  );
  
  // 删除命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.deleteCommand', deleteCommand)
  );
  
  // 发送命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.sendCommand', sendCommand)
  );
  
  // 刷新命令列表
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.refreshCommandList', refreshCommandList)
  );
}

module.exports = {
  addCommand,
  addGlobalCommand,
  addWorkspaceCommand,
  editCommand,
  deleteCommand,
  sendCommand,
  refreshCommandList,
  register,
}; 