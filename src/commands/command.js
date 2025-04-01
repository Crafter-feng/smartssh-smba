/**
 * 命令管理模块
 * 处理所有与命令管理相关的功能
 */

const vscode = require('vscode');
const configLoader = require('../adapters/config-loader');
const terminalManager = require('../services/terminal-manager');
const { logger } = require('../utils/logger');
const { CommandTreeProvider } = require('../ui/tree-view/command-provider');
const { ServerTreeProvider } = require('../ui/tree-view/server-provider');
const {
  addServer,
  editServer,
  deleteServer,
  refreshServerList,
  connectToServer,
  fastOpenConnection
} = require('./server');

// 命令树提供者实例，在register函数中初始化
let commandTreeProvider;

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
      contextValue: 'workspace-command',
      workspaceName: vscode.workspace.name || '当前工作区',
      isWorkspaceCommand: true
    };

    // 获取现有工作区命令
    const workspaceCommands = configLoader.getWorkspaceCommands();
    
    // 检查名称是否已存在
    if (workspaceCommands.some(c => c.name === name)) {
      vscode.window.showErrorMessage(`命令名称 "${name}" 已存在`);
      return;
    }
    
    // 添加新命令
    workspaceCommands.push(cmd);
    
    // 更新工作区命令
    const result = await configLoader.updateWorkspaceCommands(workspaceCommands);

    if (result) {
      vscode.window.showInformationMessage(`命令 ${name} 已添加`);

      // 刷新树视图
      vscode.commands.executeCommand('smartssh-smba.refreshCommandList');
    } else {
      vscode.window.showErrorMessage(`添加命令 ${name} 失败`);
    }
  } catch (error) {
    logger.error(`添加工作区命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`添加工作区命令时出错: ${error.message}`);
  }
}

/**
 * 编辑命令
 * @param {Object} commandItem - 命令项
 */
async function editCommand(commandItem) {
  try {
    if (!commandItem || !commandItem.commandObj) {
      vscode.window.showErrorMessage('无效的命令');
      return;
    }

    // 获取命令信息
    const name = await vscode.window.showInputBox({
      placeHolder: '命令名称',
      prompt: '输入命令名称',
      value: commandItem.commandObj.name || '',
    });

    if (name === undefined) return;

    const command = await vscode.window.showInputBox({
      placeHolder: '命令内容',
      prompt: '输入命令内容',
      value: commandItem.commandObj.command || '',
    });

    if (command === undefined) return;

    const description = await vscode.window.showInputBox({
      placeHolder: '命令描述 (可选)',
      prompt: '输入命令描述',
      value: commandItem.commandObj.description || '',
    });

    // 创建更新后的命令对象
    const updatedCmd = {
      name,
      command,
      description,
    };

    // 保存命令
    let result;
    const type = commandItem.contextValue;

    if (type === 'workspace-command') {
      result = await configLoader.updateWorkspaceCommand(commandItem.commandObj, updatedCmd);
    } else {
      result = await configLoader.updateGlobalCommand(commandItem.commandObj, updatedCmd);
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
    if (!commandItem || !commandItem.commandObj) {
      vscode.window.showErrorMessage('无效的命令');
      return;
    }

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除命令 ${commandItem.commandObj.name || commandItem.commandObj.command} 吗?`,
      { modal: true },
      '确定',
      '取消'
    );

    if (confirm !== '确定') return;

    // 删除命令
    let result;
    const type = commandItem.contextValue;

    if (type === 'workspace-command') {
      result = await configLoader.deleteWorkspaceCommand(commandItem.commandObj);
    } else {
      result = await configLoader.deleteGlobalCommand(commandItem.commandObj);
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
    logger.debug('开始发送命令', commandItem);

    // 获取命令文本
    let commandText = '';
    let serverParam = null;
    let isInitCommand = false;

    // 处理不同类型的命令项
    if (typeof commandItem === 'string') {
      // 如果是字符串命令
      commandText = commandItem;
    } else if (commandItem.commandObj) {
      // 从commandObj获取命令内容 - 树视图项的主要存储方式
      if (typeof commandItem.commandObj === 'object' && commandItem.commandObj.command) {
        commandText = commandItem.commandObj.command;
      } else if (typeof commandItem.commandObj === 'string') {
        commandText = commandItem.commandObj;
      }
    } else if (commandItem.label) {
      // 尝试使用标签作为命令（备选方案）
      commandText = commandItem.label;
    }

    // 如果命令为空，显示错误
    if (!commandText) {
      logger.error('命令为空');
      vscode.window.showErrorMessage('无效的命令或命令为空');
      return;
    }

    // 检查命令项是否关联服务器和是否是初始化命令
    if (commandItem.server) {
      serverParam = commandItem.server;
      isInitCommand = commandItem.contextValue === 'init-command';
    }

    // 获取或创建SSH终端
    const { terminal, serverName, isNewConnection } = await terminalManager.getOrCreateSSHTerminal(serverParam);

    // 如果没有获取到终端
    if (!terminal) {
      logger.warn('未能获取有效的终端');
      return;
    }

    // 显示终端
    terminal.show();

    // 如果是新连接且请求的是初始化命令，不发送命令（因为初始化命令会在创建终端时自动执行）
    if (isNewConnection && isInitCommand) {
      logger.info(`新建连接到服务器 ${serverName}，初始化命令将自动执行`);
      return;
    }

    // 发送命令到终端
    terminal.sendText(commandText);

    // 记录日志
    if (serverName) {
      logger.info(`已发送命令到服务器 ${serverName} 终端: ${commandText}`);
    } else {
      logger.info(`已发送命令到终端: ${commandText}`);
    }
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
    // 刷新配置缓存
    configLoader.refreshCache();

    // 刷新命令树视图
    if (commandTreeProvider) {
      commandTreeProvider.refresh();
    } else {
      logger.warn('命令树提供者未初始化，无法刷新');
    }

    // 显示成功消息
    vscode.window.showInformationMessage('命令列表已刷新');
  } catch (error) {
    logger.error(`刷新命令列表失败: ${error.message}`);
    vscode.window.showErrorMessage(`刷新命令列表失败: ${error.message}`);
  }
}

/**
 * 打开设置
 */
function openSettings() {
  try {
    // 打开VSCode设置并聚焦到SmartSSH-SMBA
    vscode.commands.executeCommand('workbench.action.openSettings', 'smartssh-smba');
  } catch (error) {
    logger.error(`打开设置失败: ${error.message}`);
    vscode.window.showErrorMessage(`打开设置失败: ${error.message}`);
  }
}

/**
 * 打开工作区命令设置
 */
function openWorkspaceCommandsSettings() {
  try {
    // 获取当前工作区配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 打开设置
    vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      'smartssh-smba.config'
    );
  } catch (error) {
    logger.error(`打开工作区命令设置失败: ${error.message}`);
    vscode.window.showErrorMessage(`打开工作区命令设置失败: ${error.message}`);
  }
}

/**
 * 创建工作区设置
 */
async function createWorkspaceSettings() {
  try {
    // 检查当前是否有活动的工作区
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('请先打开一个工作区文件夹');
      return;
    }

    // 获取当前工作区配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 提示用户
    const result = await vscode.window.showInformationMessage(
      '此操作将在当前工作区中创建命令配置。继续?',
      { modal: true },
      '创建'
    );

    if (result === '创建') {
      // 打开设置
      await vscode.commands.executeCommand(
        'workbench.action.openWorkspaceSettings',
        'smartssh-smba.config'
      );
    }
  } catch (error) {
    logger.error(`创建工作区设置失败: ${error.message}`);
    vscode.window.showErrorMessage(`创建工作区设置失败: ${error.message}`);
  }
}

/**
 * 创建本地工作区命令
 */
async function createLocalCommands() {
  // 调用新的实现
  await createWorkspaceSettings();
}

/**
 * 删除本地工作区
 * @param {Object} commandItem - 命令树项
 */
async function deleteLocalCommand(commandItem) {
  try {
    if (!commandItem || !commandItem.commandObj) {
      throw new Error('无效的工作区命令');
    }

    // 询问用户是否确定删除
    const result = await vscode.window.showWarningMessage(
      `确定要删除工作区命令"${commandItem.commandObj.name || commandItem.commandObj.command}"吗?`,
      { modal: true },
      '删除'
    );

    if (result === '删除') {
      // 获取当前所有工作区命令
      const workspaceCommands = configLoader.getWorkspaceCommands();

      // 过滤掉要删除的命令
      const filteredCommands = workspaceCommands.filter(cmd =>
        !(cmd.name === commandItem.commandObj.name && cmd.command === commandItem.commandObj.command)
      );

      // 更新工作区命令
      const success = await configLoader.updateWorkspaceCommands(filteredCommands);

      if (success) {
        vscode.window.showInformationMessage('命令已删除');
        // 刷新树视图
        vscode.commands.executeCommand('smartssh-smba.refreshCommandList');
      } else {
        vscode.window.showErrorMessage('删除命令失败');
      }
    }
  } catch (error) {
    logger.error(`删除本地工作区命令失败: ${error.message}`);
    vscode.window.showErrorMessage(`删除本地工作区命令失败: ${error.message}`);
  }
}

/**
 * 设置日志级别
 */
async function setLogLevel() {
  try {
    const currentLogLevel = logger.getLogLevel();
    const levels = ['debug', 'info', 'warn', 'error', 'none'];

    const selected = await vscode.window.showQuickPick(levels, {
      placeHolder: '选择日志级别',
      canPickMany: false,
    });

    if (selected) {
      logger.setLogLevel(selected);
      vscode.window.showInformationMessage(`日志级别已设置为: ${selected}`);
    }
  } catch (error) {
    logger.error(`设置日志级别失败: ${error.message}`);
    vscode.window.showErrorMessage(`设置日志级别失败: ${error.message}`);
  }
}

/**
 * 设置日志输出目标
 */
async function setLogTarget() {
  try {
    const targets = ['console', 'outputChannel', 'both', 'none'];
    const descriptions = {
      console: '仅控制台',
      outputChannel: '仅输出窗口',
      both: '控制台和输出窗口',
      none: '禁用日志',
    };

    const items = targets.map(t => ({
      label: t,
      description: descriptions[t],
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择日志输出目标',
      canPickMany: false,
    });

    if (selected) {
      logger.setLogTarget(selected.label);
      vscode.window.showInformationMessage(`日志输出目标已设置为: ${selected.label}`);
    }
  } catch (error) {
    logger.error(`设置日志输出目标失败: ${error.message}`);
    vscode.window.showErrorMessage(`设置日志输出目标失败: ${error.message}`);
  }
}

/**
 * 切换日志启用/禁用
 */
function toggleLogging() {
  try {
    const isEnabled = logger.isEnabled();
    logger.setEnabled(!isEnabled);

    if (logger.isEnabled()) {
      vscode.window.showInformationMessage('日志已启用');
    } else {
      vscode.window.showInformationMessage('日志已禁用');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`切换日志状态失败: ${error.message}`);
  }
}

/**
 * 注册命令管理命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @param {CommandTreeProvider} treeProvider - 命令树提供者实例
 * @param {ServerTreeProvider} [serverTreeProvider] - 服务器树提供者实例，可选
 */
function register(context, treeProvider, serverTreeProvider) {
  // 保存树提供者实例
  commandTreeProvider = treeProvider;

  // 服务器相关命令，只在有serverTreeProvider时注册
  if (serverTreeProvider) {
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.addServer', addServer),
      vscode.commands.registerCommand('smartssh-smba.editServer', editServer),
      vscode.commands.registerCommand('smartssh-smba.deleteServer', deleteServer),
      vscode.commands.registerCommand('smartssh-smba.refreshServerList', refreshServerList),
      vscode.commands.registerCommand('smartssh-smba.connectToServer', connectToServer),
      vscode.commands.registerCommand('smartssh-smba.fastOpenConnection', fastOpenConnection)
    );
  }

  // 命令管理相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.addGlobalCommand', addGlobalCommand),
    vscode.commands.registerCommand('smartssh-smba.addWorkspaceCommand', addWorkspaceCommand),
    vscode.commands.registerCommand('smartssh-smba.editCommand', editCommand),
    vscode.commands.registerCommand('smartssh-smba.deleteCommand', deleteCommand),
    vscode.commands.registerCommand('smartssh-smba.sendCommand', sendCommand),
    vscode.commands.registerCommand('smartssh-smba.refreshCommandList', refreshCommandList)
  );

  // 设置相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.openSettings', openSettings),
    vscode.commands.registerCommand('smartssh-smba.openWorkspaceCommandsSettings', openWorkspaceCommandsSettings),
    vscode.commands.registerCommand('smartssh-smba.createLocalCommands', createLocalCommands),
    vscode.commands.registerCommand('smartssh-smba.deleteLocalCommand', deleteLocalCommand)
  );

  // 日志相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.setLogLevel', setLogLevel),
    vscode.commands.registerCommand('smartssh-smba.setLogTarget', setLogTarget),
    vscode.commands.registerCommand('smartssh-smba.toggleLogging', toggleLogging)
  );

  // 工作区相关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.createWorkspaceSettings', createWorkspaceSettings)
  );
}

module.exports = {
  addGlobalCommand,
  addWorkspaceCommand,
  editCommand,
  deleteCommand,
  sendCommand,
  refreshCommandList,
  openSettings,
  openWorkspaceCommandsSettings,
  createLocalCommands,
  deleteLocalCommand,
  setLogLevel,
  setLogTarget,
  toggleLogging,
  createWorkspaceSettings,
  register,
};
