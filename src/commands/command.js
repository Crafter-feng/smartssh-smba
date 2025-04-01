/**
 * 命令管理模块
 * 处理所有与命令管理相关的功能
 */

const vscode = require('vscode');
const configLoader = require('../adapters/config-loader');
const terminalManager = require('../services/terminal-manager');
const { logger } = require('../utils/logger');
const { CommandTreeProvider } = require('../ui/tree-view/command-provider');

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
    let serverName = null;
    let server = null;

    // 处理不同类型的命令项
    if (typeof commandItem === 'string') {
      // 如果是字符串命令
      commandText = commandItem;
    }
    else if (commandItem.commandObj) {
      // 从commandObj获取命令内容 - 树视图项的主要存储方式
      if (typeof commandItem.commandObj === 'object' && commandItem.commandObj.command) {
        commandText = commandItem.commandObj.command;
      } else if (typeof commandItem.commandObj === 'string') {
        commandText = commandItem.commandObj;
      }
    }
    else if (commandItem.label) {
      // 尝试使用标签作为命令（备选方案）
      commandText = commandItem.label;
    }

    // 如果命令为空，显示错误
    if (!commandText) {
      logger.error('命令为空');
      vscode.window.showErrorMessage('无效的命令或命令为空');
      return;
    }

    // 服务器列表中的命令处理
    if (commandItem.server) {
      // 如果命令项有服务器属性
      server = commandItem.server;
      serverName = server.name;
      logger.debug(`命令关联的服务器: ${serverName}`);

      // 检查是否是初始化命令或服务器命令
      const isInitCommand = commandItem.contextValue === 'init-command';
      const isServerCommand = commandItem.contextValue === 'server-command' ||
        commandItem.contextValue === 'custom-command';

      logger.debug(`命令类型: ${commandItem.contextValue}`);

      // 处理SSH终端命令
      if (isInitCommand || isServerCommand) {
        // 查找该服务器的所有终端
        const serverTerminals = terminalManager.findTerminalsByServerName(serverName);

        // 如果有该服务器的终端
        if (serverTerminals.length > 0) {
          // 初始化命令和服务器已连接的情况
          let targetTerminal = null;

          // 1. 检查当前活动终端是否是该服务器的终端
          const activeSSHTerminal = terminalManager.getActiveSSHTerminal();
          if (activeSSHTerminal &&
            activeSSHTerminal.metadata &&
            activeSSHTerminal.metadata.serverName === serverName) {
            targetTerminal = activeSSHTerminal.terminal;
          }
          // 2. 如果没有活动的服务器终端，使用第一个找到的终端
          else if (serverTerminals.length > 0) {
            targetTerminal = serverTerminals[0].terminal;
          }

          if (targetTerminal) {
            targetTerminal.show();
            targetTerminal.sendText(commandText);
            logger.info(`已发送命令到服务器 ${serverName} 终端: ${commandText}`);
            return;
          }
        }

        // 如果没有该服务器的终端或无法找到目标终端
        if (isInitCommand) {
          // 如果是初始化命令且服务器未连接，则连接服务器
          logger.info(`服务器 ${serverName} 未连接，正在连接...`);
          try {
            // 使用terminal-manager创建SSH连接
            const connected = await terminalManager.connectToServer(serverName, false);
            if (connected) {
              logger.info(`服务器 ${serverName} 连接已触发，初始化命令将自动执行`);
              return;
            }
          } catch (error) {
            logger.error(`连接到服务器 ${serverName} 失败: ${error.message}`);
            vscode.window.showErrorMessage(`连接到服务器 ${serverName} 失败: ${error.message}`);
            return;
          }
        } else {
          // 如果是其他服务器命令，需要先连接服务器
          logger.info(`服务器 ${serverName} 未连接，正在连接...`);
          try {
            // 使用terminal-manager创建SSH连接
            const connected = await terminalManager.connectToServer(serverName, false);
            if (!connected) {
              throw new Error(`无法连接到服务器 ${serverName}`);
            }

            // 等待终端创建
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 查找新创建的终端
            const newServerTerminals = terminalManager.findTerminalsByServerName(serverName);
            if (newServerTerminals.length > 0) {
              const terminal = newServerTerminals[0].terminal;
              terminal.show();
              terminal.sendText(commandText);
              logger.info(`已发送命令到服务器 ${serverName} 新终端: ${commandText}`);
            } else {
              logger.error(`无法找到服务器 ${serverName} 的终端`);
              vscode.window.showErrorMessage(`无法找到服务器 ${serverName} 的终端`);
            }
            return;
          } catch (error) {
            logger.error(`连接到服务器 ${serverName} 失败: ${error.message}`);
            vscode.window.showErrorMessage(`连接到服务器 ${serverName} 失败: ${error.message}`);
            return;
          }
        }
      }
    }
    // 扩展命令和无服务器关联的命令处理
    else {
      // 获取所有SSH终端
      const sshTerminals = terminalManager.getAllSSHTerminals();

      // 如果有SSH终端
      if (sshTerminals.length > 0) {
        // 1. 检查当前活动的终端是否是SSH终端
        const activeSSHTerminal = terminalManager.getActiveSSHTerminal();
        if (activeSSHTerminal) {
          // 如果有活动的SSH终端，直接使用
          activeSSHTerminal.terminal.show();
          activeSSHTerminal.terminal.sendText(commandText);
          logger.info(`已发送命令到活动的SSH终端 ${activeSSHTerminal.name}: ${commandText}`);
          return;
        }

        // 2. 如果只有一个SSH终端，直接使用
        if (sshTerminals.length === 1) {
          const terminal = sshTerminals[0].terminal;
          terminal.show();
          terminal.sendText(commandText);
          logger.info(`已发送命令到唯一的SSH终端 ${sshTerminals[0].name}: ${commandText}`);
          return;
        }

        // 3. 如果有多个SSH终端，让用户选择
        const terminalItems = sshTerminals.map(t => ({
          label: t.serverName || t.name.split(':')[0],
          description: t.metadata && t.metadata.serverInfo ?
            `${t.metadata.serverInfo.username}@${t.metadata.serverInfo.host}` : '',
          detail: t.name,
          terminal: t.terminal
        }));

        const selected = await vscode.window.showQuickPick(
          terminalItems,
          { placeHolder: '选择目标SSH终端' }
        );

        if (selected) {
          selected.terminal.show();
          selected.terminal.sendText(commandText);
          logger.info(`已发送命令到选定的SSH终端 ${selected.label}: ${commandText}`);
          return;
        }
      }

      // 如果没有SSH终端或用户取消选择，询问是否连接新服务器或使用当前终端
      const result = await vscode.window.showInformationMessage(
        '没有活动的SSH连接。请选择操作:',
        '连接服务器',
        '使用当前终端',
        '取消'
      );

      if (result === '连接服务器') {
        // 使用terminal-manager创建SSH连接
        try {
          // 获取服务器列表
          const serverList = configLoader.getServerList();
          if (!serverList || serverList.length === 0) {
            vscode.window.showInformationMessage('没有配置服务器，请先添加服务器');
            return;
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

          if (selection) {
            const serverName = selection.label;
            const serverConfig = await configLoader.getServerByName(serverName);
            if (!serverConfig) {
              throw new Error(`找不到服务器: ${serverName}`);
            }
            terminalManager.createSshTerminal(serverConfig);

            // 等待终端创建完成
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 查找新创建的服务器终端
            const newServerTerminals = terminalManager.findTerminalsByServerName(serverName);
            if (newServerTerminals.length > 0) {
              const terminal = newServerTerminals[0].terminal;
              terminal.show();
              terminal.sendText(commandText);
              logger.info(`已发送命令到新连接的服务器 ${serverName} 终端: ${commandText}`);
            } else {
              logger.error(`无法找到新连接的服务器 ${serverName} 终端`);
              vscode.window.showErrorMessage(`无法找到新连接的服务器 ${serverName} 终端`);
            }
          }
        } catch (error) {
          logger.error(`连接服务器失败: ${error.message}`);
          vscode.window.showErrorMessage(`连接服务器失败: ${error.message}`);
        }
        return;
      } else if (result === '使用当前终端') {
        // 使用当前活动的终端，如果没有则创建一个
        const activeTerminal = vscode.window.activeTerminal;
        if (activeTerminal) {
          activeTerminal.show();
          activeTerminal.sendText(commandText);
          logger.info(`已发送命令到当前终端: ${commandText}`);
        } else {
          const localTerminal = terminalManager.findOrCreateLocalTerminal('Command Terminal');
          localTerminal.show();
          localTerminal.sendText(commandText);
          logger.info(`已发送命令到本地终端: ${commandText}`);
        }
        return;
      } else {
        // 用户取消
        return;
      }
    }

    // 如果代码执行到这里，尝试使用当前活动终端
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal) {
      activeTerminal.show();
      activeTerminal.sendText(commandText);
      logger.info(`已发送命令到当前终端: ${commandText}`);
    } else {
      const localTerminal = terminalManager.findOrCreateLocalTerminal('Command Terminal');
      localTerminal.show();
      localTerminal.sendText(commandText);
      logger.info(`已发送命令到本地终端: ${commandText}`);
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
 * 注册命令管理命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @param {CommandTreeProvider} treeProvider - 命令树提供者实例
 */
function register(context, treeProvider) {
  // 保存命令树提供者实例
  commandTreeProvider = treeProvider;

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

  // 打开设置
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.openSettings', openSettings)
  );

  // 打开工作区命令设置
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.openWorkspaceCommandsSettings', openWorkspaceCommandsSettings)
  );

  // 创建本地命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.createLocalCommands', createLocalCommands)
  );

  // 删除本地命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.deleteLocalCommand', deleteLocalCommand)
  );

  // 设置日志级别
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.setLogLevel', setLogLevel)
  );

  // 设置日志目标
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.setLogTarget', setLogTarget)
  );

  // 切换日志状态
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.toggleLogging', toggleLogging)
  );

  // 创建工作区设置
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
