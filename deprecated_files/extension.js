/* eslint-disable no-useless-escape */
/* eslint-disable @stylistic/brace-style */
/* eslint-disable @stylistic/comma-dangle */
// 'vscode' 模块包含 VS Code 扩展 API
const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const commandExistsSync = require('command-exists').sync;
const configLoader = require('./adapters/config-loader');
const { ServerTreeProvider, CommandTreeProvider } = require('./src/serverTreeProvider');
const { logger, LogLevel, LogTarget } = require('./src/utils/logger');

// 全局变量
let fastOpenConnectionButton = null;
let servers = [];
let terminals = [];
let serverTreeProvider = null;
let commandTreeProvider = null;

/**
 * 扩展激活入口点
 * @param {vscode.ExtensionContext} context - 扩展上下文
 * @returns {Object} - 扩展 API
 */
function activate(context) {
  try {
    // 初始化扩展组件
    initExtension();

    // 创建树视图提供者
    serverTreeProvider = new ServerTreeProvider();
    commandTreeProvider = new CommandTreeProvider();

    // 将服务器列表设为全局变量，以便树视图提供者可以访问
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
    registerCommands(context);

    // 初始更新状态栏按钮
    updateStatusBarButton();

    // 记录日志
    logger.info('扩展已激活');

    // 加载服务器列表
    loadServerList();

    // 设置配置监视器
    setupConfigWatchers(context);

    // 转换远程路径为本地 SMB 路径
    registerFilePathClickHandler(context);

    // 返回扩展 API
    return {
      getTerminals: function () {
        return terminals;
      },
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
  // 如果需要，清理资源
}

/**
 * 初始化扩展组件
 */
function initExtension() {
  try {
    // 记录初始化信息
    logger.info('正在初始化扩展...');

    // 检查 SSH 命令是否存在
    if (!commandExistsSync('ssh')) {
      logger.error('未找到 SSH 命令，请确保已安装 SSH 客户端');
      vscode.window.showErrorMessage('未找到 SSH 命令，请确保已安装 SSH 客户端');
    } else {
      logger.info('已检测到 SSH 命令');
    }

    // 创建状态栏按钮
    fastOpenConnectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    fastOpenConnectionButton.command = 'smartssh-smba.fastOpenConnection';
    fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
    fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    fastOpenConnectionButton.show();

    // 监听终端关闭事件
    vscode.window.onDidCloseTerminal(terminal => {
      // 查找关闭的终端在数组中的索引
      const index = terminals.findIndex(t => t.terminal === terminal);
      if (index !== -1) {
        logger.info(`终端 ${terminals[index].name} 已关闭`);
        // 从数组中移除该终端
        terminals.splice(index, 1);
      }
    });

    logger.info('扩展组件初始化完成');
  } catch (error) {
    logger.error(`初始化扩展组件时出错: ${error.message}`);
  }
}

/**
 * 注册命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function registerCommands(context) {
  try {
    // 注册打开 SSH 连接命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openConnection', async () => {
        const serverName = await selectServer();
        if (serverName) {
          openSSHConnection(serverName);
        }
      })
    );

    // 注册快速打开连接命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.fastOpenConnection', async () => {
        try {
          // 获取当前活动的编辑器
          const editor = vscode.window.activeTextEditor;
          let serverName = null;

          if (editor) {
            // 获取当前文件的路径
            const filePath = editor.document.uri.fsPath;
            if (filePath) {
              // 查找匹配的服务器
              const matchedServer = findServerForPath(filePath);
              if (matchedServer) {
                serverName = matchedServer.name;
              }
            }
          }

          // 如果没有找到匹配的服务器，显示服务器选择列表
          if (!serverName) {
            serverName = await selectServer();
            if (!serverName) {
              return; // 用户取消
            }
          }

          // 打开 SSH 连接
          openSSHConnection(serverName, true);
        } catch (error) {
          logger.error(`快速打开连接时出错: ${error.message}`);
          vscode.window.showErrorMessage(`快速打开连接时出错: ${error.message}`);
        }
      })
    );

    // 注册刷新服务器列表命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.refreshServerList', () => {
        refreshServerList();
      })
    );

    // 注册刷新命令列表命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.refreshCommandList', () => {
        refreshCommandList();
      })
    );

    // 注册连接到服务器命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.connectToServer', server => {
        try {
          // 如果 server 是字符串（服务器名称），直接使用
          if (typeof server === 'string') {
            openSSHConnection(server);
            return;
          }

          // 如果 server 是对象，尝试获取服务器名称
          let serverName = null;

          if (server && server.name) {
            // 如果 server 是服务器对象且有 name 属性
            serverName = server.name;
          } else if (server && server.label) {
            // 如果 server 是 QuickPickItem 且有 label 属性
            serverName = server.label;
          } else if (server && server.configuration && server.configuration.name) {
            // 如果 server 是树项且有 configuration.name 属性
            serverName = server.configuration.name;
          } else if (server && server.server && server.server.name) {
            // 如果 server 是树项且有 server.name 属性
            serverName = server.server.name;
          }

          if (serverName) {
            openSSHConnection(serverName);
          } else {
            logger.error('无法确定服务器名称');
            vscode.window.showErrorMessage('无法确定服务器名称');
          }
        } catch (error) {
          logger.error('连接到服务器时出错', error);
          vscode.window.showErrorMessage(`连接到服务器时出错: ${error.message}`);
        }
      })
    );

    // 注册发送命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.sendCommand', item => {
        sendCommand(item);
      })
    );

    // 注册添加服务器命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.addServer', () => {
        addServer();
      })
    );

    // 注册编辑服务器命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.editServer', server => {
        editServer(server);
      })
    );

    // 注册删除服务器命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.deleteServer', server => {
        deleteServer(server);
      })
    );

    // 注册添加命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.addCommand', context => {
        // 检查上下文参数
        if (typeof context === 'object' && context.viewItem === 'workspace-commands-group') {
          addCommand('workspace-commands-group');
        } else {
          addCommand('global-command');
        }
      })
    );

    // 注册编辑命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.editCommand', cmdObj => {
        editCommand(cmdObj);
      })
    );

    // 注册删除命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.deleteCommand', cmdObj => {
        deleteCommand(cmdObj);
      })
    );

    // 注册打开设置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'smartssh-smba');
      })
    );

    // 注册打开工作区设置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openWorkspaceCommandsSettings', () => {
        vscode.commands.executeCommand(
          'workbench.action.openWorkspaceSettings',
          {
            query: 'smartssh-smba.config',
          }
        );
      })
    );

    // 注册创建工作区配置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.createLocalCommands', async () => {
        try {
          // 获取当前工作区文件夹
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('没有打开的工作区');
            return;
          }

          // 如果有多个工作区文件夹，让用户选择
          let targetFolder;
          if (workspaceFolders.length === 1) {
            targetFolder = workspaceFolders[0];
          } else {
            const folderItems = workspaceFolders.map(folder => ({
              label: folder.name,
              description: folder.uri.fsPath,
              folder,
            }));

            const selected = await vscode.window.showQuickPick(folderItems, {
              placeHolder: '选择工作区',
            });

            if (!selected) {
              return; // 用户取消
            }

            targetFolder = selected.folder;
          }

          // 创建或编辑工作区配置
          const result = await createOrEditLocalCommandsConfig(targetFolder.uri.fsPath);
          if (result) {
            vscode.window.showInformationMessage(`已为工作区 ${targetFolder.name} 创建或编辑工作区配置`);
          } else {
            vscode.window.showErrorMessage(`为工作区 ${targetFolder.name} 创建或编辑工作区配置失败`);
          }
        } catch (error) {
          logger.error(`创建或编辑工作区配置时出错: ${error.message}`);
          vscode.window.showErrorMessage(`创建或编辑工作区配置时出错: ${error.message}`);
        }
      })
    );

    // 注册删除工作区命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.deleteLocalCommand', cmdObj => {
        if (cmdObj && cmdObj.commandObj) {
          deleteCommand({
            ...cmdObj.commandObj,
            contextValue: 'workspace-command'
          });
        } else {
          vscode.window.showErrorMessage('无法确定要删除的命令');
        }
      })
    );

    // 注册添加用户命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.addGlobalCommand', () => {
        addCommand('global-command');
      })
    );

    // 注册添加工作区命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.addWorkspaceCommand', () => {
        addCommand('workspace-command');
      })
    );

    // 注册日志控制命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.setLogLevel', async () => {
        const levels = [
          { label: 'NONE - 禁用所有日志', value: LogLevel.NONE },
          { label: 'ERROR - 只显示错误', value: LogLevel.ERROR },
          { label: 'WARN - 显示警告和错误', value: LogLevel.WARN },
          { label: 'INFO - 显示信息、警告和错误（默认）', value: LogLevel.INFO },
          { label: 'DEBUG - 显示调试信息', value: LogLevel.DEBUG },
          { label: 'TRACE - 显示所有详细信息', value: LogLevel.TRACE }
        ];

        const selected = await vscode.window.showQuickPick(levels, {
          placeHolder: '选择日志级别'
        });

        if (selected) {
          logger.setLogLevel(selected.value);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.setLogTarget', async () => {
        const targets = [
          { label: 'NONE - 不输出日志', value: LogTarget.NONE },
          { label: 'CONSOLE - 只输出到控制台', value: LogTarget.CONSOLE },
          { label: 'OUTPUT_CHANNEL - 只输出到输出通道', value: LogTarget.OUTPUT_CHANNEL },
          { label: 'BOTH - 同时输出到控制台和输出通道（默认）', value: LogTarget.BOTH }
        ];

        const selected = await vscode.window.showQuickPick(targets, {
          placeHolder: '选择日志输出目标'
        });

        if (selected) {
          logger.setLogTarget(selected.value);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.toggleLogging', () => {
        if (logger.enabled) {
          logger.disable();
          vscode.window.showInformationMessage('SmartSSH-SMBA 日志已禁用');
        } else {
          logger.enable();
          vscode.window.showInformationMessage('SmartSSH-SMBA 日志已启用');
        }
      })
    );
  } catch (error) {
    logger.error('注册命令时出错', error);
  }
}

/**
 * 设置配置监视器
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function setupConfigWatchers(context) {
  try {
    // 使用防抖函数包装刷新操作
    const debouncedRefresh = debounce(() => {
      // 清除配置缓存
      configLoader.clearConfigCache();

      // 加载服务器列表（这会同时刷新服务器和命令列表）
      loadServerList();
    }, 300);

    // 监听配置变更事件
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        // 如果我们正在保存配置，忽略这个事件
        if (global._smartsshSavingConfig) {
          return;
        }

        if (event.affectsConfiguration('smartssh-smba.config')) {
          logger.info('检测到配置变更，正在刷新...');
          debouncedRefresh();
        }
      })
    );

    logger.info('配置监视器设置完成');
  } catch (error) {
    logger.error('设置配置监视器时出错:', error);
    logger.error(`设置配置监视器时出错: ${error.message}`);
  }
}

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * 选择服务器
 * @returns {Promise<string>} 选择的服务器名称
 */
async function selectServer() {
  try {
    // 如果只有一个服务器，直接返回它
    if (servers.length === 1) {
      return servers[0].name;
    }

    // 如果没有服务器，显示错误消息
    if (servers.length === 0) {
      vscode.window.showErrorMessage('没有配置服务器。请先添加服务器。');
      return null;
    }

    // 创建服务器选择列表
    const serverItems = servers.map(server => ({
      label: server.name,
      description: `${server.configuration.username}@${server.configuration.host}`,
      detail: server.configuration.description || '',
    }));

    // 显示服务器选择列表
    const selected = await vscode.window.showQuickPick(serverItems, {
      placeHolder: '选择要连接的服务器',
    });

    // 如果用户取消，返回 null
    if (!selected) {
      return null;
    }

    // 返回选择的服务器名称
    return selected.label;
  } catch (error) {
    logger.error(`选择服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`选择服务器时出错: ${error.message}`);
    return null;
  }
}

/**
 * 加载服务器列表
 */
function loadServerList() {
  try {
    // 加载服务器列表
    const serverList = configLoader.getServerList();

    // 确保服务器对象格式正确
    servers = serverList.map(server => {
      // 如果服务器对象已经包含 configuration 属性，直接返回
      if (server.configuration && server.name) {
        return server;
      }

      // 否则，创建正确的格式
      return {
        name: server.name || '未命名服务器',
        configuration: server
      };
    });

    // 更新全局变量
    global.servers = servers;

    // 更新树视图
    updateTreeProviders();

    // 更新状态栏按钮
    updateStatusBarButton();

    logger.info(`服务器列表已加载，共 ${servers.length} 个服务器`);
  } catch (error) {
    logger.error(`加载服务器列表时出错: ${error.message}`);
  }
}

/**
 * 更新树视图提供者
 */
function updateTreeProviders() {
  try {
    logger.info('正在更新树视图提供者...');

    // 更新服务器树视图
    if (serverTreeProvider) {
      serverTreeProvider.servers = servers;
      serverTreeProvider.refresh();
      logger.info('服务器树视图已更新');
    }

    // 更新命令树视图
    if (commandTreeProvider) {
      commandTreeProvider.refresh();
      logger.info('命令树视图已更新');
    }
  } catch (error) {
    logger.error(`更新树视图提供者时出错: ${error.message}`);
  }
}

/**
 * 检查 SSH 可执行文件是否可用
 * @returns {Boolean} - SSH 是否可用
 */
function checkSSHExecutable() {
  try {
    const checkResult = commandExistsSync('ssh');

    if (checkResult) {
      logger.info('在系统上找到了 SSH 命令');
    } else {
      logger.info('在系统上未找到 SSH 命令');
    }

    logger.info('如果您使用第三方终端，请确保其中有 SSH 工具');

    return checkResult;
  } catch (error) {
    logger.error('检查 SSH 命令时出错', error);
    return false;
  }
}

/**
 * 打开到指定服务器的 SSH 连接
 * @param {string} serverName - 服务器名称
 * @param {boolean} force - 是否强制创建新终端
 * @returns {Promise<boolean>} - 是否成功的 Promise
 */
async function openSSHConnection(serverName, force = false) {
  if (serverName === undefined) {
    return false;
  }

  try {
    // 检查 SSH 命令是否可用
    if (!checkSSHExecutable()) {
      vscode.window.showErrorMessage('未找到 SSH 命令。请确保 SSH 已安装并添加到 PATH 中。');
      return false;
    }

    // 查找服务器配置
    const server = servers.find(s => s.name === serverName);
    if (!server) {
      logger.error(`未找到服务器 ${serverName} 的配置`);
      vscode.window.showErrorMessage(`未找到服务器 ${serverName} 的配置`);
      return false;
    }

    // 验证服务器配置
    if (server.configuration.host === undefined || server.configuration.username === undefined) {
      logger.error(`服务器 ${serverName} 的主机或用户名未定义`);
      vscode.window.showErrorMessage(`服务器 ${serverName} 的主机或用户名未定义`);
      return false;
    }

    // 检查是否已存在该服务器的终端
    const existingTerminal = terminals.find(t => t.name === serverName);

    // 如果终端已存在且不强制创建新终端
    if (existingTerminal && !force) {
      // 显示现有终端
      existingTerminal.terminal.show();
      logger.info(`已存在服务器 ${serverName} 的终端，显示该终端`);
      return true;
    }
    // 如果终端已存在且强制创建新终端
    else if (existingTerminal && force) {
      // 关闭旧终端
      try {
        existingTerminal.terminal.dispose();
        // 从数组中移除
        const index = terminals.findIndex(t => t.name === serverName);
        if (index !== -1) {
          terminals.splice(index, 1);
        }
        logger.info(`已关闭服务器 ${serverName} 的旧终端`);
      } catch (error) {
        logger.warn(`关闭旧终端时出错: ${error.message}`);
      }
    }

    // 创建终端
    const terminal = vscode.window.createTerminal(serverName);

    // 显示终端
    terminal.show();

    // 将终端添加到列表中
    terminals.push({
      name: serverName,
      terminal: terminal,
      host: server.configuration.host,
      username: server.configuration.username,
      server: server,
    });

    // 更新状态栏按钮
    updateStatusBarButton();

    // 构建 SSH 命令
    const sshCommand = buildSSHCommand(server.configuration);

    // 发送 SSH 命令
    const fullCommand = `${sshCommand.command} ${sshCommand.args.join(' ')}`;
    terminal.sendText(fullCommand);

    // 如果使用密码认证，处理密码
    if (sshCommand.authMethod === 'byPassword' && server.configuration.password) {
      setTimeout(() => {
        terminal.sendText(server.configuration.password);
      }, 1000);
    }

    logger.info(`已创建到服务器 ${serverName} 的 SSH 连接`);
    return true;
  } catch (error) {
    logger.error(`打开 SSH 连接时出错: ${error.message}`);
    vscode.window.showErrorMessage(`打开 SSH 连接时出错: ${error.message}`);
    return false;
  }
}

/**
 * 构建 SSH 命令
 * @param {Object} config - 服务器配置
 * @returns {Object} - SSH 命令对象
 */
function buildSSHCommand(config) {
  try {
    // 基本 SSH 命令
    let command = 'ssh';
    let args = [];
    let authMethod = 'byKey'; // 默认使用密钥认证

    // 添加主机参数
    const hostArg = `${config.username}@${config.host}`;
    args.push(hostArg);

    // 添加端口参数
    if (config.port && config.port !== 22) {
      args.push('-p', config.port.toString());
    }

    // 添加私钥参数
    if (config.privateKey) {
      args.push('-i', config.privateKey);
    } else if (config.password) {
      // 如果没有私钥但有密码，使用密码认证
      authMethod = 'byPassword';
    }

    // 添加代理参数
    if (config.agent) {
      args.push('-A');
    }

    // 处理远程命令
    const remoteCommands = [];

    // 处理 SMB 映射以自动更改目录
    const remotePath = getRemotePathFromSmbMapping(config);
    if (remotePath) {
      remoteCommands.push(`cd ${remotePath}`);
    } else if (config.path) {
      // 如果没有 SMB 映射但有配置路径，则使用配置的路径
      remoteCommands.push(`cd ${config.path}`);
    }

    // 添加初始化命令
    if (config.initCommands && config.initCommands.length > 0) {
      for (const cmd of config.initCommands) {
        // 处理命令对象或字符串
        const commandText = typeof cmd === 'object' ? cmd.command : cmd;
        remoteCommands.push(commandText);
      }
    }

    remoteCommands.push(`eval $(echo '$SHELL') --login`);

    // 构建命令字符串，每个命令后面加分号
    const commandString = remoteCommands.map(cmd => `${cmd};`).join(' ');
    args.push('-t');
    // 添加 shell 启动命令，确保交互式 shell
    args.push(`"${commandString}"`);

    return {
      command: command,
      args: args,
      authMethod: authMethod
    };
  } catch (error) {
    logger.error(`构建 SSH 命令时出错: ${error.message}`);
    throw error;
  }
}

/**
 * 刷新服务器列表
 */
function refreshServerList() {
  try {
    // 加载服务器列表
    const serverList = configLoader.getServerList();

    // 确保服务器对象格式正确
    servers = serverList.map(server => {
      // 如果服务器对象已经包含 configuration 属性，直接返回
      if (server.configuration && server.name) {
        return server;
      }

      // 否则，创建正确的格式
      return {
        name: server.name || '未命名服务器',
        configuration: server
      };
    });

    // 更新全局变量
    global.servers = servers;

    // 更新树视图
    updateTreeProviders();

    // 更新状态栏按钮
    updateStatusBarButton();

    logger.info(`服务器列表已加载，共 ${servers.length} 个服务器`);
  } catch (error) {
    logger.error(`刷新服务器列表时出错: ${error.message}`);
  }
}

/**
 * 刷新命令列表
 */
function refreshCommandList() {
  try {
    // 清除配置缓存，确保获取最新配置
    configLoader.clearConfigCache();

    // 更新树视图
    updateTreeProviders();

    logger.info('命令列表已刷新');
  } catch (error) {
    logger.error(`刷新命令列表时出错: ${error.message}`);
  }
}

/**
 * 创建或编辑工作区配置
 * @param {string} folderPath - 工作区文件夹路径
 * @returns {Promise<boolean>} - 是否成功创建或编辑
 */
async function createOrEditLocalCommandsConfig(folderPath) {
  try {
    logger.info(`正在创建或编辑工作区配置: ${folderPath}`);

    // 获取当前工作区配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 打开设置
    await vscode.commands.executeCommand(
      'workbench.action.openWorkspaceSettings',
      {
        query: 'smartssh-smba.config',
      }
    );

    logger.info('工作区配置已打开');
    return true;
  } catch (error) {
    logger.error(`创建或编辑工作区配置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除命令
 * @param {Object} cmdObj - 命令对象
 */
async function deleteCommand(cmdObj) {
  try {
    if (!cmdObj) {
      vscode.window.showErrorMessage('命令对象为空');
      return;
    }

    // 确定是否为工作区命令
    const isWorkspace = cmdObj.contextValue === 'workspace-command';
    const cmdName = typeof cmdObj === 'string' ? cmdObj : cmdObj.name;

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除${isWorkspace ? '工作区' : '全局'}命令 "${cmdName}" 吗？`,
      { modal: true },
      '删除'
    );

    if (confirm !== '删除') {
      return; // 用户取消
    }

    if (isWorkspace) {
      // 删除工作区命令
      const configData = configLoader.loadConfig();
      const workspaceCommands = configData.workspaceCommands || [];

      // 查找命令
      const cmdIndex = workspaceCommands.findIndex(cmd => cmd.name === cmdName);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到工作区命令 "${cmdName}"`);
        return;
      }

      // 删除命令
      workspaceCommands.splice(cmdIndex, 1);

      // 更新配置
      await configLoader.updateWorkspaceCommands(workspaceCommands);
    } else {
      // 删除用户命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands.filter(cmd => cmd.contextValue !== 'workspace-command') || [];

      // 查找命令
      const cmdIndex = customCommands.findIndex(cmd => cmd.name === cmdName);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到用户命令 "${cmdName}"`);
        return;
      }

      // 删除命令
      customCommands.splice(cmdIndex, 1);

      // 更新配置
      configData.customCommands = customCommands;
      await configLoader.saveConfig(configData);
    }

    // 刷新命令列表
    refreshCommandList();

    vscode.window.showInformationMessage(`已删除${isWorkspace ? '工作区' : '全局'}命令 "${cmdName}"`);
  } catch (error) {
    const cmdType = cmdObj && cmdObj.contextValue === 'workspace-command' ? '工作区' : '全局';
    logger.error(`删除${cmdType}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除${cmdType}命令时出错: ${error.message}`);
  }
}

/**
 * 更新状态栏按钮
 */
function updateStatusBarButton() {
  try {
    logger.info('正在更新状态栏按钮...');

    // 如果按钮不存在，创建它
    if (!fastOpenConnectionButton) {
      logger.info('创建状态栏按钮...');
      fastOpenConnectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      fastOpenConnectionButton.command = 'smartssh-smba.fastOpenConnection';
    }

    // 检查是否只有一个服务器
    if (servers && servers.length === 1) {
      const singleServer = servers[0];
      logger.info(`只有一个服务器: ${singleServer.name}，直接显示连接按钮`);
      fastOpenConnectionButton.text = `$(terminal) 连接 ${singleServer.name}`;
      fastOpenConnectionButton.tooltip = `打开到 ${singleServer.name} 的 SSH 连接`;
      fastOpenConnectionButton.show();
      return;
    }

    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;

    // 如果没有活动的编辑器，显示通用按钮
    if (!editor) {
      logger.info('没有活动的编辑器，显示通用按钮');
      fastOpenConnectionButton.text = `$(terminal)  连接 SSH `;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
      return;
    }

    // 获取当前文件的路径
    const filePath = editor.document.uri.fsPath;

    // 如果没有文件路径，显示通用按钮
    if (!filePath) {
      logger.info('无法获取文件路径，显示通用按钮');
      fastOpenConnectionButton.text = `$(terminal)  连接 SSH `;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
      return;
    }

    logger.info(`当前文件路径: ${filePath}`);
    logger.info(`服务器数量: ${servers ? servers.length : 0}`);

    // 查找匹配的服务器
    const matchedServer = findServerForPath(filePath);

    // 如果找到匹配的服务器，显示特定服务器的按钮
    if (matchedServer) {
      logger.info(`找到匹配的服务器: ${matchedServer.name}，显示特定按钮`);
      fastOpenConnectionButton.text = `$(terminal) 连接 ${matchedServer.name}`;
      fastOpenConnectionButton.tooltip = `打开到 ${matchedServer.name} 的 SSH 连接`;
    } else {
      // 如果没有找到匹配的服务器，显示通用按钮
      logger.info('没有匹配的服务器，显示通用按钮');
      fastOpenConnectionButton.text = `$(terminal)  连接 SSH `;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    }

    // 始终显示按钮
    fastOpenConnectionButton.show();
  } catch (error) {
    logger.error(`更新状态栏按钮时出错: ${error.message}`);
    logger.error(`错误堆栈: ${error.stack}`);
  }
}

/**
 * 查找与文件路径匹配的服务器
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器对象，如果没有匹配则返回 null
 */
function findServerForPath(filePath) {
  try {
    logger.functionStart('findServerForPath', { filePath });

    // 如果没有服务器配置，返回 null
    if (!servers || servers.length === 0) {
      logger.debug('没有服务器配置');
      return null;
    }

    // 规范化文件路径并转为小写（Windows 路径不区分大小写）
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    logger.debug(`规范化后的文件路径: ${normalizedPath}`);

    // 查找最长匹配的服务器
    let bestMatch = null;
    let bestMatchLength = 0;

    for (const server of servers) {
      logger.trace(`检查服务器: ${server.name}`);

      // 首先检查 pathMappings 配置
      if (server.configuration.pathMappings && server.configuration.pathMappings.length > 0) {
        // 检查每个路径映射
        for (const mapping of server.configuration.pathMappings) {
          logger.trace(`检查路径映射: ${JSON.stringify(mapping)}`);

          // 检查本地路径是否配置
          if (mapping.localPath) {
            // 规范化本地路径并转为小写
            const localPath = mapping.localPath.replace(/\\/g, '/').toLowerCase();
            logger.debug(`服务器 ${server.name} 的本地路径: ${localPath}`);

            // 检查文件路径是否以本地路径开头
            if (normalizedPath.startsWith(localPath)) {
              const matchLength = localPath.length;
              logger.debug(`找到匹配，长度: ${matchLength}`);

              // 如果这是最长匹配，更新最佳匹配
              if (matchLength > bestMatchLength) {
                bestMatch = server;
                bestMatchLength = matchLength;
                logger.debug(`更新最佳匹配为: ${server.name}`);
              }
            }
          }
        }
      }
      // 向后兼容：检查旧的 smbMapping 配置
      else if (server.configuration.smbMapping && server.configuration.smbMapping.localPath) {
        // 规范化本地路径并转为小写
        const localPath = server.configuration.smbMapping.localPath.replace(/\\/g, '/').toLowerCase();
        logger.debug(`服务器 ${server.name} 的旧式 SMB 本地路径: ${localPath}`);

        // 检查文件路径是否以本地路径开头
        if (normalizedPath.startsWith(localPath)) {
          const matchLength = localPath.length;
          logger.debug(`找到旧式 SMB 匹配，长度: ${matchLength}`);

          // 如果这是最长匹配，更新最佳匹配
          if (matchLength > bestMatchLength) {
            bestMatch = server;
            bestMatchLength = matchLength;
            logger.debug(`更新最佳匹配为: ${server.name}`);
          }
        }
      }
    }

    if (bestMatch) {
      logger.info(`找到匹配的服务器: ${bestMatch.name}`);
      logger.functionEnd('findServerForPath', { serverName: bestMatch.name });
      return bestMatch;
    }

    logger.debug('没有找到匹配的服务器');
    logger.functionEnd('findServerForPath', { serverName: null });
    return null;
  } catch (error) {
    logger.error('查找匹配服务器时出错', error);
    return null;
  }
}

/**
 * 添加新服务器
 */
async function addServer() {
  try {
    // 获取当前配置
    const configData = configLoader.loadConfig();
    const serverList = configData.serverList || [];

    // 提示用户输入服务器名称
    const serverName = await vscode.window.showInputBox({
      prompt: '输入服务器名称',
      placeHolder: '例如: 开发服务器'
    });

    if (!serverName) {
      return; // 用户取消
    }

    // 检查名称是否已存在
    if (serverList.some(server => server.name === serverName)) {
      vscode.window.showErrorMessage(`服务器名称 "${serverName}" 已存在`);
      return;
    }

    // 提示用户输入主机名
    const host = await vscode.window.showInputBox({
      prompt: '输入主机名或 IP 地址',
      placeHolder: '例如: example.com 或 192.168.1.100'
    });

    if (!host) {
      return; // 用户取消
    }

    // 提示用户输入端口
    const portStr = await vscode.window.showInputBox({
      prompt: '输入 SSH 端口 (可选)',
      placeHolder: '默认: 22',
      value: '22'
    });

    if (portStr === undefined) {
      return; // 用户取消
    }

    const port = parseInt(portStr, 10);

    // 提示用户输入用户名
    const username = await vscode.window.showInputBox({
      prompt: '输入用户名',
      placeHolder: '例如: root'
    });

    if (!username) {
      return; // 用户取消
    }

    // 询问用户使用密码还是私钥
    const authType = await vscode.window.showQuickPick(
      [
        { label: '密码', value: 'password' },
        { label: '私钥文件', value: 'privateKey' }
      ],
      { placeHolder: '选择认证方式' }
    );

    if (!authType) {
      return; // 用户取消
    }

    // 根据认证方式提示用户输入
    let password = '';
    let privateKey = '';

    if (authType.value === 'password') {
      password = await vscode.window.showInputBox({
        prompt: '输入密码',
        password: true
      });

      if (password === undefined) {
        return; // 用户取消
      }
    } else {
      // 提示用户选择私钥文件
      const privateKeyOptions = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: '选择私钥文件',
        filters: {
          'All Files': ['*']
        }
      });

      if (!privateKeyOptions || privateKeyOptions.length === 0) {
        return; // 用户取消
      }

      privateKey = privateKeyOptions[0].fsPath;
    }

    // 提示用户输入远程路径
    const path = await vscode.window.showInputBox({
      prompt: '输入远程路径 (可选)',
      placeHolder: '例如: /var/www/html'
    });

    // 创建新服务器配置
    const newServer = {
      name: serverName,
      host,
      port,
      username,
      path: path || ''
    };

    // 根据认证方式设置密码或私钥
    if (authType.value === 'password') {
      newServer.password = password;
    } else {
      newServer.privateKey = privateKey;
    }

    // 添加到服务器列表
    serverList.push(newServer);

    // 更新配置
    configData.serverList = serverList;
    await configLoader.saveConfig(configData);

    // 刷新服务器列表
    refreshServerList();

    vscode.window.showInformationMessage(`已添加服务器 "${serverName}"`);
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
      vscode.window.showErrorMessage('服务器对象为空');
      return;
    }

    // 获取当前配置
    const configData = configLoader.loadConfig();
    const serverList = configData.serverList || [];

    // 确定服务器名称
    let serverName = null;

    // 处理不同类型的服务器对象
    if (typeof server === 'string') {
      // 如果是字符串，直接使用
      serverName = server;
    } else if (server.name) {
      // 如果是服务器对象且有 name 属性
      serverName = server.name;
    } else if (server.configuration && server.configuration.name) {
      // 如果是树项且有 configuration.name 属性
      serverName = server.configuration.name;
    } else if (server.server && server.server.name) {
      // 如果是树项且有 server.name 属性
      serverName = server.server.name;
    } else if (server.label) {
      // 如果是 QuickPickItem 且有 label 属性
      serverName = server.label;
    }

    if (!serverName) {
      vscode.window.showErrorMessage('无法确定服务器名称');
      return;
    }

    // 查找服务器
    const serverIndex = serverList.findIndex(s => s.name === serverName);

    if (serverIndex === -1) {
      vscode.window.showErrorMessage(`找不到服务器 "${serverName}"`);
      return;
    }

    // 获取当前服务器配置
    const currentServer = serverList[serverIndex];

    // 提示用户输入新的服务器名称
    const newServerName = await vscode.window.showInputBox({
      prompt: '输入服务器名称',
      value: currentServer.name
    });

    if (!newServerName) {
      return; // 用户取消
    }

    // 如果名称已更改，检查是否已存在
    if (newServerName !== currentServer.name && serverList.some(s => s.name === newServerName)) {
      vscode.window.showErrorMessage(`服务器名称 "${newServerName}" 已存在`);
      return;
    }

    // 提示用户输入主机名
    const host = await vscode.window.showInputBox({
      prompt: '输入主机名或 IP 地址',
      value: currentServer.host
    });

    if (!host) {
      return; // 用户取消
    }

    // 提示用户输入端口
    const portStr = await vscode.window.showInputBox({
      prompt: '输入 SSH 端口',
      value: String(currentServer.port || 22)
    });

    if (portStr === undefined) {
      return; // 用户取消
    }

    const port = parseInt(portStr, 10);

    // 提示用户输入用户名
    const username = await vscode.window.showInputBox({
      prompt: '输入用户名',
      value: currentServer.username
    });

    if (!username) {
      return; // 用户取消
    }

    // 询问用户使用密码还是私钥
    const authType = await vscode.window.showQuickPick(
      [
        { label: '密码', value: 'password' },
        { label: '私钥文件', value: 'privateKey' }
      ],
      {
        placeHolder: '选择认证方式',
        activeItems: [currentServer.password ? 0 : 1]
      }
    );

    if (!authType) {
      return; // 用户取消
    }

    // 根据认证方式提示用户输入
    let password = '';
    let privateKey = '';

    if (authType.value === 'password') {
      password = await vscode.window.showInputBox({
        prompt: '输入密码',
        password: true,
        value: currentServer.password || ''
      });

      if (password === undefined) {
        return; // 用户取消
      }
    } else {
      // 提示用户选择私钥文件
      const privateKeyOptions = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: '选择私钥文件',
        filters: {
          'All Files': ['*']
        },
        defaultUri: currentServer.privateKey ? vscode.Uri.file(currentServer.privateKey) : undefined
      });

      if (!privateKeyOptions || privateKeyOptions.length === 0) {
        return; // 用户取消
      }

      privateKey = privateKeyOptions[0].fsPath;
    }

    // 提示用户输入远程路径
    const path = await vscode.window.showInputBox({
      prompt: '输入远程路径 (可选)',
      value: currentServer.path || ''
    });

    // 更新服务器配置
    const updatedServer = {
      name: newServerName,
      host,
      port,
      username,
      path: path || ''
    };

    // 根据认证方式设置密码或私钥
    if (authType.value === 'password') {
      updatedServer.password = password;
      delete updatedServer.privateKey;
    } else {
      updatedServer.privateKey = privateKey;
      delete updatedServer.password;
    }

    // 保留其他配置
    if (currentServer.customCommands) {
      updatedServer.customCommands = currentServer.customCommands;
    }

    if (currentServer.smbMapping) {
      updatedServer.smbMapping = currentServer.smbMapping;
    }

    if (currentServer.project) {
      updatedServer.project = currentServer.project;
    }

    // 更新服务器列表
    serverList[serverIndex] = updatedServer;

    // 更新配置
    configData.serverList = serverList;
    await configLoader.saveConfig(configData);

    // 刷新服务器列表
    refreshServerList();

    vscode.window.showInformationMessage(`已更新服务器 "${newServerName}"`);
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
      vscode.window.showErrorMessage('服务器对象为空');
      return;
    }

    // 获取当前配置
    const configData = configLoader.loadConfig();
    const serverList = configData.serverList || [];

    // 确定服务器名称
    let serverName = null;

    // 处理不同类型的服务器对象
    if (typeof server === 'string') {
      // 如果是字符串，直接使用
      serverName = server;
    } else if (server.name) {
      // 如果是服务器对象且有 name 属性
      serverName = server.name;
    } else if (server.configuration && server.configuration.name) {
      // 如果是树项且有 configuration.name 属性
      serverName = server.configuration.name;
    } else if (server.server && server.server.name) {
      // 如果是树项且有 server.name 属性
      serverName = server.server.name;
    } else if (server.label) {
      // 如果是 QuickPickItem 且有 label 属性
      serverName = server.label;
    }

    if (!serverName) {
      vscode.window.showErrorMessage('无法确定服务器名称');
      return;
    }

    // 查找服务器
    const serverIndex = serverList.findIndex(s => s.name === serverName);

    if (serverIndex === -1) {
      vscode.window.showErrorMessage(`找不到服务器 "${serverName}"`);
      return;
    }

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除服务器 "${serverName}" 吗？`,
      { modal: true },
      '删除'
    );

    if (confirm !== '删除') {
      return; // 用户取消
    }

    // 删除服务器
    serverList.splice(serverIndex, 1);

    // 更新配置
    configData.serverList = serverList;
    await configLoader.saveConfig(configData);

    // 刷新服务器列表
    refreshServerList();

    vscode.window.showInformationMessage(`已删除服务器 "${serverName}"`);
  } catch (error) {
    logger.error(`删除服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除服务器时出错: ${error.message}`);
  }
}

/**
 * 添加命令
 * @param {string} contextValue - 上下文值，用于确定命令类型
 */
async function addCommand(contextValue) {
  try {
    // 确定是否为工作区命令
    const isWorkspace = contextValue === 'workspace-commands-group' || contextValue === 'workspace-command';

    // 提示用户输入命令名称
    const name = await vscode.window.showInputBox({
      prompt: `输入${isWorkspace ? '工作区' : '全局'}命令名称`,
      placeHolder: '例如: 列出文件',
    });

    if (!name) {
      return; // 用户取消
    }

    // 提示用户输入命令
    const command = await vscode.window.showInputBox({
      prompt: '输入命令',
      placeHolder: '例如: ls -la',
    });

    if (!command) {
      return; // 用户取消
    }

    // 提示用户输入描述
    const description = await vscode.window.showInputBox({
      prompt: '输入描述 (可选)',
      placeHolder: '例如: 列出当前目录下的所有文件和文件夹',
    });

    // 创建命令对象
    const cmdObj = {
      name,
      command,
      description: description || '',
      contextValue: isWorkspace ? 'workspace-command' : 'global-command'
    };

    if (isWorkspace) {
      // 添加工作区命令
      // 获取当前工作区配置
      const configData = configLoader.loadConfig();
      const workspaceCommands = configData.workspaceCommands || [];

      // 检查名称是否已存在
      if (workspaceCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`工作区命令名称 "${name}" 已存在`);
        return;
      }

      // 添加工作区标识
      cmdObj.workspaceName = vscode.workspace.name || '当前工作区';

      // 添加命令
      workspaceCommands.push(cmdObj);

      // 更新配置
      await configLoader.updateWorkspaceCommands(workspaceCommands);
    } else {
      // 添加用户命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands.filter(cmd => cmd.contextValue !== 'workspace-command') || [];

      // 检查名称是否已存在
      if (customCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`用户命令名称 "${name}" 已存在`);
        return;
      }

      // 添加命令
      customCommands.push(cmdObj);

      // 更新配置
      configData.customCommands = customCommands;
      await configLoader.saveConfig(configData);
    }

    // 刷新命令列表
    refreshCommandList();

    vscode.window.showInformationMessage(`已添加${isWorkspace ? '工作区' : '全局'}命令 "${name}"`);
  } catch (error) {
    const cmdType = contextValue === 'workspace-commands-group' || contextValue === 'workspace-command' ? '工作区' : '全局';
    logger.error(`添加${cmdType}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`添加${cmdType}命令时出错: ${error.message}`);
  }
}

/**
 * 编辑命令
 * @param {Object} cmdObj - 命令对象
 */
async function editCommand(cmdObj) {
  try {
    if (!cmdObj) {
      vscode.window.showErrorMessage('命令对象为空');
      return;
    }

    // 确定是否为工作区命令
    const isWorkspace = cmdObj.contextValue === 'workspace-command';

    // 提示用户输入新的命令名称
    const name = await vscode.window.showInputBox({
      prompt: `输入${isWorkspace ? '工作区' : '全局'}命令名称`,
      value: cmdObj.name,
    });

    if (!name) {
      return; // 用户取消
    }

    // 提示用户输入命令
    const command = await vscode.window.showInputBox({
      prompt: '输入命令',
      value: cmdObj.command,
    });

    if (!command) {
      return; // 用户取消
    }

    // 提示用户输入描述
    const description = await vscode.window.showInputBox({
      prompt: '输入描述 (可选)',
      value: cmdObj.description || '',
    });

    // 创建更新后的命令对象
    const updatedCmd = {
      name,
      command,
      description: description || '',
      contextValue: cmdObj.contextValue
    };

    if (isWorkspace) {
      // 编辑工作区命令
      const configData = configLoader.loadConfig();
      const workspaceCommands = configData.workspaceCommands || [];

      // 查找命令
      const cmdIndex = workspaceCommands.findIndex(cmd => cmd.name === cmdObj.name);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到工作区命令 "${cmdObj.name}"`);
        return;
      }

      // 如果名称已更改，检查是否已存在
      if (name !== cmdObj.name && workspaceCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`工作区命令名称 "${name}" 已存在`);
        return;
      }

      // 保留工作区标识
      updatedCmd.workspaceName = cmdObj.workspaceName || vscode.workspace.name || '当前工作区';

      // 更新命令
      workspaceCommands[cmdIndex] = updatedCmd;

      // 更新配置
      await configLoader.updateWorkspaceCommands(workspaceCommands);
    } else {
      // 编辑用户命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands.filter(cmd => cmd.contextValue !== 'workspace-command') || [];

      // 查找命令
      const cmdIndex = customCommands.findIndex(cmd => cmd.name === cmdObj.name);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到用户命令 "${cmdObj.name}"`);
        return;
      }

      // 如果名称已更改，检查是否已存在
      if (name !== cmdObj.name && customCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`用户命令名称 "${name}" 已存在`);
        return;
      }

      // 更新命令
      customCommands[cmdIndex] = updatedCmd;

      // 更新配置
      configData.customCommands = customCommands;
      await configLoader.saveConfig(configData);
    }

    // 刷新命令列表
    refreshCommandList();

    vscode.window.showInformationMessage(`已更新${isWorkspace ? '工作区' : '全局'}命令 "${name}"`);
  } catch (error) {
    const cmdType = cmdObj && cmdObj.contextValue === 'workspace-command' ? '工作区' : '全局';
    logger.error(`编辑${cmdType}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`编辑${cmdType}命令时出错: ${error.message}`);
  }
}

/**
 * 发送命令
 * @param {Object} item - 命令项
 */
async function sendCommand(item) {
  try {
    logger.functionStart('sendCommand', { item });

    // 获取命令文本
    let commandText = '';
    let serverName = null;

    // 处理不同类型的命令项
    if (item.commandObj) {
      // 如果是命令对象
      commandText = item.commandObj.command;
      logger.debug(`从命令对象获取命令: ${commandText}`);
    } else if (typeof item === 'string') {
      // 如果是字符串
      commandText = item;
      logger.debug(`从字符串获取命令: ${commandText}`);
    } else {
      // 如果是其他类型，尝试获取命令文本
      commandText = item.command || item.label || '';
      logger.debug(`从其他类型获取命令: ${commandText}`);
    }

    // 如果命令为空，显示错误
    if (!commandText) {
      logger.error('命令为空');
      vscode.window.showErrorMessage('命令为空');
      return;
    }

    // 检查是否有服务器
    if (item.server) {
      // 如果命令项有服务器属性，使用该服务器
      const server = item.server;
      serverName = server.name;
      logger.debug(`命令关联的服务器: ${serverName}`);

      // 检查是否是初始化命令
      const isInitCommand = item.contextValue === 'init-command';
      logger.debug(`是否为初始化命令: ${isInitCommand}`);

      // 查找是否已有该服务器的终端
      const existingTerminal = terminals.find(t => t.name === serverName);
      logger.debug(`服务器 ${serverName} 是否已有终端: ${!!existingTerminal}`);

      if (isInitCommand && !existingTerminal) {
        // 如果是初始化命令且服务器未连接，则连接服务器
        // 连接过程会自动执行初始化命令
        logger.info(`初始化命令：服务器 ${serverName} 未连接，正在连接...`);
        await openSSHConnection(serverName);
        return;
      }

      // 查找或创建终端
      const terminal = findOrCreateTerminal(server);
      terminal.show();

      // 发送命令
      terminal.sendText(commandText);
      logger.info(`已发送命令到服务器 ${serverName}: ${commandText}`);
    } else {
      // 如果没有服务器，检查是否有活动的 SSH 终端
      if (terminals.length > 0) {
        logger.debug(`有 ${terminals.length} 个活动的 SSH 终端`);

        // 如果有多个终端，让用户选择
        let targetTerminal;

        if (terminals.length === 1) {
          targetTerminal = terminals[0];
          logger.debug(`只有一个终端，直接使用: ${targetTerminal.name}`);
        } else {
          // 尝试获取当前活动的终端
          const activeTerminal = vscode.window.activeTerminal;
          const activeSSHTerminal = terminals.find(t =>
            t.terminal === activeTerminal ||
            t.terminal.name === activeTerminal?.name
          );

          if (activeSSHTerminal) {
            // 如果当前活动的终端是 SSH 终端，直接使用
            targetTerminal = activeSSHTerminal;
            logger.debug(`使用当前活动的 SSH 终端: ${targetTerminal.name}`);
          } else {
            // 否则让用户选择
            logger.debug('显示终端选择列表');
            const terminalItems = terminals.map(t => ({
              label: t.name,
              description: `${t.username}@${t.host}`,
              terminal: t,
            }));

            const selected = await vscode.window.showQuickPick(
              terminalItems,
              { placeHolder: '选择目标终端' }
            );

            if (!selected) {
              logger.debug('用户取消了终端选择');
              return; // 用户取消
            }

            targetTerminal = selected.terminal;
            logger.debug(`用户选择了终端: ${targetTerminal.name}`);
          }
        }

        // 发送命令到选定的终端
        targetTerminal.terminal.show();
        targetTerminal.terminal.sendText(commandText);
        logger.info(`已发送命令到终端 ${targetTerminal.name}: ${commandText}`);
      } else {
        logger.debug('没有活动的 SSH 终端，询问用户操作');

        // 如果没有 SSH 终端，询问用户是否要连接服务器
        const result = await vscode.window.showInformationMessage(
          '没有活动的 SSH 连接。是否连接服务器?',
          '连接',
          '发送到本地终端',
          '取消'
        );

        logger.debug(`用户选择: ${result}`);

        if (result === '连接') {
          // 选择服务器并连接
          const serverName = await selectServer();

          if (!serverName) {
            logger.debug('用户取消了服务器选择');
            return; // 用户取消
          }

          logger.debug(`用户选择了服务器: ${serverName}`);

          // 打开连接
          await openSSHConnection(serverName);

          // 等待终端创建完成
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 查找新创建的终端
          const newTerminal = terminals.find(t => t.name === serverName);

          if (newTerminal) {
            // 发送命令到新终端
            newTerminal.terminal.show();
            newTerminal.terminal.sendText(commandText);
            logger.info(`已发送命令到服务器 ${serverName}: ${commandText}`);
          } else {
            logger.error(`无法找到服务器 ${serverName} 的终端`);
            vscode.window.showErrorMessage(`无法找到服务器 ${serverName} 的终端`);
          }
        } else if (result === '发送到本地终端') {
          // 发送到活动终端或创建新终端
          const terminal = findOrCreateLocalTerminal();
          terminal.show();
          terminal.sendText(commandText);
          logger.info(`已发送命令到本地终端: ${commandText}`);
        } else {
          // 用户取消
          logger.debug('用户取消了操作');
          return;
        }
      }
    }

    logger.functionEnd('sendCommand');
  } catch (error) {
    logger.error('发送命令时出错', error);
    vscode.window.showErrorMessage(`发送命令时出错: ${error.message}`);
  }
}

/**
 * 查找或创建服务器终端
 * @param {Object} server - 服务器对象
 * @returns {vscode.Terminal} - 终端对象
 */
function findOrCreateTerminal(server) {
  try {
    // 获取服务器名称
    const serverName = server.name;

    // 查找现有终端
    const existingTerminal = terminals.find(t => t.name === serverName);

    if (existingTerminal) {
      // 如果终端已存在，直接返回
      return existingTerminal.terminal;
    } else {
      // 如果终端不存在，打开新连接
      logger.info(`服务器 ${serverName} 的终端不存在，正在打开新连接...`);

      // 打开 SSH 连接
      openSSHConnection(serverName);

      // 等待终端创建完成
      // 注意：这里我们返回一个延迟对象，实际上终端可能还没有完全准备好
      // 但是 openSSHConnection 会创建终端并添加到 terminals 数组中

      // 查找新创建的终端
      const newTerminal = terminals.find(t => t.name === serverName);

      if (newTerminal) {
        return newTerminal.terminal;
      } else {
        // 如果找不到终端，创建一个新的本地终端作为后备
        logger.warn('警告: 无法找到服务器 ' + serverName + ' 的终端，创建本地终端代替');
        const fallbackTerminal = vscode.window.createTerminal(`SmartSSH-SMBA: ${serverName}`);
        return fallbackTerminal;
      }
    }
  } catch (error) {
    logger.error(`查找或创建终端时出错: ${error.message}`);

    // 出错时创建一个本地终端作为后备
    const fallbackTerminal = vscode.window.createTerminal('SmartSSH-SMBA');
    return fallbackTerminal;
  }
}

/**
 * 查找或创建本地终端
 * @returns {vscode.Terminal} - 终端对象
 */
function findOrCreateLocalTerminal() {
  try {
    // 尝试获取当前活动的终端
    const activeTerminal = vscode.window.activeTerminal;

    if (activeTerminal) {
      // 如果有活动终端，直接使用
      return activeTerminal;
    } else {
      // 否则创建新终端
      const newTerminal = vscode.window.createTerminal('SmartSSH-SMBA Local');
      return newTerminal;
    }
  } catch (error) {
    logger.error('查找或创建本地终端时出错:', error);
    logger.error(`查找或创建本地终端时出错: ${error.message}`);

    // 出错时创建一个新终端作为后备
    const fallbackTerminal = vscode.window.createTerminal('SmartSSH-SMBA Local');
    return fallbackTerminal;
  }
}

/**
 * 从 SMB 映射获取远程路径
 * @param {Object} serverConfig - 服务器配置
 * @returns {string|null} - 远程路径或 null
 */
function getRemotePathFromSmbMapping(serverConfig) {
  try {
    // 获取当前工作区路径
    const currentWorkspacePath = vscode.workspace.workspaceFolders
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : null;

    if (!currentWorkspacePath) {
      return null;
    }

    logger.debug(`当前工作区路径: ${currentWorkspacePath}`);

    // 使用 smbMappingList
    if (serverConfig.smbMappingList && Array.isArray(serverConfig.smbMappingList)) {
      // 标准化工作区路径
      let normalizedWorkspacePath = currentWorkspacePath.replace(/\\/g, '/').toLowerCase();

      // 处理 Windows 驱动器盘符
      const workspaceDrive = /^[a-zA-Z]:/.test(normalizedWorkspacePath)
        ? normalizedWorkspacePath.substring(0, 1).toLowerCase()
        : '';

      if (workspaceDrive) {
        normalizedWorkspacePath = normalizedWorkspacePath.substring(2);
      }

      // 确保路径以斜杠开头
      if (!normalizedWorkspacePath.startsWith('/')) {
        normalizedWorkspacePath = '/' + normalizedWorkspacePath;
      }

      logger.debug(`标准化后的工作区路径: ${normalizedWorkspacePath}`);

      // 遍历所有映射
      for (const mapping of serverConfig.smbMappingList) {
        if (!mapping || !mapping.localPath || !mapping.remotePath) {
          continue;
        }

        // 标准化本地路径
        let normalizedLocalPath = mapping.localPath.replace(/\\/g, '/').toLowerCase();
        const localDrive = /^[a-zA-Z]:/.test(normalizedLocalPath)
          ? normalizedLocalPath.substring(0, 1).toLowerCase()
          : '';

        if (localDrive) {
          // 如果工作区和本地路径的驱动器不匹配，跳过此映射
          if (workspaceDrive && localDrive !== workspaceDrive) {
            logger.debug(`驱动器不匹配: ${localDrive} !== ${workspaceDrive}`);
            continue;
          }
          normalizedLocalPath = normalizedLocalPath.substring(2);
        }

        // 确保本地路径以斜杠开头
        if (!normalizedLocalPath.startsWith('/')) {
          normalizedLocalPath = '/' + normalizedLocalPath;
        }

        // 标准化远程路径，处理 ~/ 开头的路径
        let normalizedRemotePath = mapping.remotePath.replace(/\\/g, '/');

        // 处理 ~/ 开头的路径
        if (normalizedRemotePath.startsWith('~/')) {
          // 保持 ~/ 开头
          if (!normalizedRemotePath.startsWith('~/')) {
            normalizedRemotePath = '~/' + normalizedRemotePath.substring(1);
          }
        } else {
          // 非 ~/ 开头的路径确保以 / 开头
          if (!normalizedRemotePath.startsWith('/')) {
            normalizedRemotePath = '/' + normalizedRemotePath;
          }
        }

        logger.debug(`检查映射: 本地=${normalizedLocalPath}, 远程=${normalizedRemotePath}`);

        // 检查工作区路径是否在此映射范围内
        if (normalizedWorkspacePath.startsWith(normalizedLocalPath)) {
          // 计算相对路径
          const relativePath = normalizedWorkspacePath.substring(normalizedLocalPath.length);

          // 移除开头的斜杠（如果存在）
          const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

          // 移除远程路径末尾的斜杠（如果存在）
          const cleanRemotePath = normalizedRemotePath.endsWith('/')
            ? normalizedRemotePath.slice(0, -1)
            : normalizedRemotePath;

          // 使用单个斜杠连接路径，保持 ~/ 的情况
          const remotePath = `${cleanRemotePath}/${cleanRelativePath}`;

          logger.info(`找到匹配的映射: ${remotePath}`);
          return remotePath;
        }
      }

      // 如果没有找到匹配的映射，但有映射配置，使用第一个映射的远程路径
      if (serverConfig.smbMappingList.length > 0 && serverConfig.smbMappingList[0].remotePath) {
        let defaultPath = serverConfig.smbMappingList[0].remotePath;
        // 确保默认路径也正确处理 ~/
        if (!defaultPath.startsWith('~/') && !defaultPath.startsWith('/')) {
          defaultPath = '/' + defaultPath;
        }
        logger.warn(`无法精确映射工作区路径 ${currentWorkspacePath}，使用默认远程路径: ${defaultPath}`);
        return defaultPath;
      }
    }

    // 如果没有配置路径映射，但有配置路径，则使用配置的路径
    if (serverConfig.path) {
      // 确保配置路径也正确处理 ~/
      let configPath = serverConfig.path;
      if (!configPath.startsWith('~/') && !configPath.startsWith('/')) {
        configPath = '/' + configPath;
      }
      logger.debug(`使用配置的默认路径: ${configPath}`);
      return configPath;
    }

    logger.debug('没有找到可用的路径映射');
    return null;
  } catch (error) {
    logger.error(`获取远程路径时出错: ${error.message}`);
    return null;
  }
}

/**
 * 将远程路径转换为本地路径
 * @param {string} remotePath - 远程路径
 * @param {Object} server - 服务器配置
 * @returns {string|null} - 本地路径或null
 */
function convertRemotePathToLocal(remotePath, server) {
  try {
    if (!remotePath || !server || !server.configuration) {
      return null;
    }

    logger.debug(`尝试转换远程路径: ${remotePath}`);

    // 使用 smbMappingList
    if (server.configuration.smbMappingList && Array.isArray(server.configuration.smbMappingList)) {
      // 标准化远程路径
      let normalizedRemotePath = remotePath.replace(/\\/g, '/');

      // 确保远程路径是以 / 或 ~/ 开头
      if (!normalizedRemotePath.startsWith('/') && !normalizedRemotePath.startsWith('~/')) {
        logger.debug('远程路径必须以 / 或 ~/ 开头');
        return null;
      }

      // 遍历所有映射
      for (const mapping of server.configuration.smbMappingList) {
        if (!mapping || !mapping.localPath || !mapping.remotePath) {
          continue;
        }

        // 标准化映射的远程路径
        let normalizedMappingRemote = mapping.remotePath.replace(/\\/g, '/');

        // 确保映射的远程路径也是以 / 或 ~/ 开头
        if (!normalizedMappingRemote.startsWith('/') && !normalizedMappingRemote.startsWith('~/')) {
          normalizedMappingRemote = '/' + normalizedMappingRemote;
        }

        // 移除末尾的斜杠
        normalizedMappingRemote = normalizedMappingRemote.endsWith('/')
          ? normalizedMappingRemote.slice(0, -1)
          : normalizedMappingRemote;
        normalizedRemotePath = normalizedRemotePath.endsWith('/')
          ? normalizedRemotePath.slice(0, -1)
          : normalizedRemotePath;

        // 如果两个路径都是 ~/ 开头，移除 ~/ 后比较
        if (normalizedMappingRemote.startsWith('~/') && normalizedRemotePath.startsWith('~/')) {
          const mappingWithoutTilde = normalizedMappingRemote.substring(2);
          const pathWithoutTilde = normalizedRemotePath.substring(2);

          if (!pathWithoutTilde.startsWith(mappingWithoutTilde)) {
            continue;
          }

          // 计算相对路径
          const relativePath = pathWithoutTilde.substring(mappingWithoutTilde.length);
          const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

          // 标准化本地路径（确保是Windows格式的路径）
          let localPath = mapping.localPath.replace(/\//g, '\\');

          // 确保本地路径是以盘符开头
          if (!/^[a-zA-Z]:/i.test(localPath)) {
            logger.debug('本地路径必须以盘符开头');
            continue;
          }

          // 拼接最终路径
          const finalPath = localPath.endsWith('\\')
            ? `${localPath}${cleanRelativePath.replace(/\//g, '\\')}`
            : `${localPath}\\${cleanRelativePath.replace(/\//g, '\\')}`;

          logger.info(`找到匹配的映射，转换为本地路径: ${finalPath}`);
          return finalPath;
        }

        // 处理普通的 / 开头路径
        if (normalizedRemotePath.startsWith(normalizedMappingRemote)) {
          // 计算相对路径
          const relativePath = normalizedRemotePath.substring(normalizedMappingRemote.length);
          const cleanRelativePath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;

          // 标准化本地路径（确保是Windows格式的路径）
          let localPath = mapping.localPath.replace(/\//g, '\\');

          // 确保本地路径是以盘符开头
          if (!/^[a-zA-Z]:/i.test(localPath)) {
            logger.debug('本地路径必须以盘符开头');
            continue;
          }

          // 拼接最终路径
          const finalPath = localPath.endsWith('\\')
            ? `${localPath}${cleanRelativePath.replace(/\//g, '\\')}`
            : `${localPath}\\${cleanRelativePath.replace(/\//g, '\\')}`;

          logger.info(`找到匹配的映射，转换为本地路径: ${finalPath}`);
          return finalPath;
        }
      }
    }

    logger.debug('没有找到匹配的映射');
    return null;
  } catch (error) {
    logger.error(`转换远程路径时出错: ${error.message}`);
    return null;
  }
}

/**
 * 检查文件或文件夹是否存在
 * @param {string} path - 要检查的路径
 * @returns {Promise<{exists: boolean, isDirectory: boolean}>} - 存在性和类型信息
 */
async function checkPathExists(path) {
  try {
    const stats = await fs.stat(path);
    return {
      exists: true,
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return {
      exists: false,
      isDirectory: false
    };
  }
}

/**
 * 注册文件路径点击处理器
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function registerFilePathClickHandler(context) {
  // 注册命令以打开转换后的文件路径
  const disposable = vscode.commands.registerCommand('smartssh-smba.openMappedFile', async (filePath, serverName, line, column) => {
    try {
      logger.info(`尝试打开映射文件: ${filePath}`);

      // 提取文件名和行列号信息（如果没有传入，尝试从路径中解析）
      const fileInfo = extractFileInfo(filePath);
      const fileName = fileInfo.fileName;
      line = line || fileInfo.line;
      column = column || fileInfo.column;

      // 确定要使用的服务器
      let server = null;
      if (serverName) {
        server = servers.find(s => s.name === serverName);
      } else {
        const activeTerminal = vscode.window.activeTerminal ?
          terminals.find(t => t.terminal === vscode.window.activeTerminal) : null;
        if (activeTerminal) {
          server = servers.find(s => s.name === activeTerminal.name);
        }
      }

      if (!server) {
        logger.warn('没有活动的服务器连接');
        // 即使没有服务器连接，也尝试通过文件名搜索
        await searchAndOpenFile(fileName, line, column);
        return;
      }

      // 尝试转换路径
      const localPath = convertRemotePathToLocal(filePath, server);
      if (localPath) {
        // 检查文件是否存在
        const { exists, isDirectory } = await checkPathExists(localPath);

        if (exists) {
          if (isDirectory) {
            // 处理目录的逻辑保持不变...
          } else {
            // 如果是文件，打开文件
            logger.info(`打开文件: ${localPath}`);
            try {
              const document = await vscode.workspace.openTextDocument(localPath);
              const editor = await vscode.window.showTextDocument(document);
              if (line !== undefined) {
                const position = new vscode.Position(line - 1, column || 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
              }
            } catch (error) {
              logger.warn(`无法在编辑器中打开文件: ${error.message}，尝试用系统默认程序打开`);
              const uri = vscode.Uri.file(localPath);
              await vscode.commands.executeCommand('revealFileInOS', uri);
            }
          }
        } else {
          // 文件不存在，尝试通过文件名搜索
          logger.info(`文件不存在: ${localPath}，尝试通过文件名搜索`);
          await searchAndOpenFile(fileName, line, column);
        }
      } else {
        // 路径转换失败，尝试通过文件名搜索
        logger.info(`无法转换路径: ${filePath}，尝试通过文件名搜索`);
        await searchAndOpenFile(fileName, line, column);
      }
    } catch (error) {
      logger.error(`打开映射文件时出错: ${error.message}`);
      vscode.window.showErrorMessage(`打开文件时出错: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);

  // 注册终端链接处理器
  const termLinkProvider = vscode.window.registerTerminalLinkProvider({
    provideTerminalLinks: (context, token) => {
      const links = [];

      // 获取当前活动终端对应的服务器
      const activeTerminal = vscode.window.activeTerminal ? terminals.find(t => t.terminal === vscode.window.activeTerminal) : null;
      if (!activeTerminal) {
        return links;
      }

      // 获取活动终端对应的服务器
      const activeServer = servers.find(s => s.name === activeTerminal.name);
      if (!activeServer || !activeServer.configuration || !activeServer.configuration.smbMappingList) {
        return links;
      }

      // 在文本中查找所有可能的路径
      const potentialPaths = findPotentialPaths(context.line);

      // 处理每个潜在路径
      for (const pathInfo of potentialPaths) {
        links.push({
          startIndex: pathInfo.startIndex,
          length: pathInfo.length,
          tooltip: `服务器(${activeServer.name})：点击打开 `,
          data: {
            filePath: pathInfo.path,
            line: pathInfo.line,
            column: pathInfo.column,
            serverName: activeServer.name
          }
        });
      }

      return links;
    },
    handleTerminalLink: async link => {
      const { filePath, line, column, serverName, isRelative, workspaceRoot } = link.data;
      try {
        // 提取文件名
        const fileName = filePath ? filePath.split(/[\/\\]/).pop() : null;
        if (!fileName) {
          logger.warn('无法获取文件名');
          return;
        }

        // 如果是相对路径，先尝试在工作区中查找
        if (isRelative && workspaceRoot) {
          try {
            const absolutePath = path.resolve(workspaceRoot, filePath);
            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            if (line !== undefined) {
              const position = new vscode.Position(line - 1, column || 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
            return;
          } catch (error) {
            logger.warn(`直接打开相对路径文件失败: ${error.message}，尝试其他方法`);
          }
        }

        // 如果有文件路径且不是相对路径，尝试通过 SMB 映射打开
        if (filePath && !isRelative) {
          try {
            await vscode.commands.executeCommand('smartssh-smba.openMappedFile', filePath, serverName);
            return;
          } catch (error) {
            logger.warn(`通过 SMB 映射打开文件失败: ${error.message}，尝试搜索文件`);
          }
        }

        // 如果上述方法都失败，使用文件搜索
        logger.info(`尝试通过搜索打开文件: ${fileName}`);
        const files = await vscode.workspace.findFiles(`**/${fileName}`, null, 5);

        if (files.length === 0) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
        } else if (files.length === 1) {
          const document = await vscode.workspace.openTextDocument(files[0]);
          const editor = await vscode.window.showTextDocument(document);
          if (line !== undefined) {
            const position = new vscode.Position(line - 1, column || 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
          }
        } else {
          const items = files.map(file => ({
            label: path.basename(file.fsPath),
            description: vscode.workspace.asRelativePath(file.fsPath),
            file
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要打开的文件'
          });

          if (selected) {
            const document = await vscode.workspace.openTextDocument(selected.file);
            const editor = await vscode.window.showTextDocument(document);
            if (line !== undefined) {
              const position = new vscode.Position(line - 1, column || 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            }
          }
        }
      } catch (error) {
        logger.error(`处理终端链接时出错: ${error.message}`);
        if (fileName) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
        }
      }
    }
  });

  context.subscriptions.push(termLinkProvider);
}

/**
 * 在文本中查找所有路径
 * @param {string} text - 要搜索的文本
 * @returns {Array} - 找到的路径信息数组
 */
function findPotentialPaths(text) {
  const results = [];
  try {
    // URL 检测的正则表达式
    const urlPattern = /(?:\b(?:https?|ftp|file):\/\/|www\.)[^\s/$.?#].[^\s]*/gi;

    // 记录 URL 位置
    const urlMatches = new Set();
    let urlMatch;
    while ((urlMatch = urlPattern.exec(text)) !== null) {
      for (let i = urlMatch.index; i < urlMatch.index + urlMatch[0].length; i++) {
        urlMatches.add(i);
      }
    }

    // 定义不同类型的路径匹配模式
    const patterns = [
      // 1. 标准 Unix 路径（以 / 或 ~/ 开头）
      {
        pattern: /((?:\/|~\/)[^:\s\(\)"']+)(?::(\d+))?(?::(\d+))?/g,
        type: 'unix'
      },
      // 2. CMake 错误格式
      {
        pattern: /(?:^|\s)([^:\s\(\)"']+(?:\.(?:cpp|hpp|c|h|cc|cxx|hxx|cmake|txt))?)(?:\((\d+)(?:,(\d+))?\)):/g,
        type: 'cmake'
      },
      // 3. Make/GCC 错误格式（包括相对路径）
      {
        pattern: /(?:^|\s)((?:\.{1,2}\/)?[^:\s\(\)"']+(?:\.(?:cpp|hpp|c|h|cc|cxx|hxx|mk|in))?)(?::(\d+)(?::(\d+))?):(?:\s+(?:error|warning|note):|$)/g,
        type: 'make'
      },
      // 4. 相对路径格式（以 ./ 或 ../ 开头）
      {
        pattern: /((?:\.{1,2}\/)[^:\s\(\)"']+)(?::(\d+))?(?::(\d+))?/g,
        type: 'relative'
      }
    ];

    // 处理每种模式
    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 检查是否与 URL 重叠
        let isPartOfUrl = false;
        for (let i = match.index; i < match.index + match[0].length; i++) {
          if (urlMatches.has(i)) {
            isPartOfUrl = true;
            break;
          }
        }

        if (isPartOfUrl) {
          logger.debug(`跳过 URL 的一部分: ${match[0]}`);
          continue;
        }

        const [fullMatch, path, lineStr, colStr] = match;
        let processedPath = path;

        // 提取文件名和行列号信息
        const fileName = path.split(/[\/\\]/).pop();
        const line = lineStr ? parseInt(lineStr, 10) : undefined;
        const column = colStr ? parseInt(colStr, 10) : undefined;

        // 创建搜索信息对象
        const searchInfo = fileName
          ? {
            fileName,
            pattern: `**/${fileName}`,
            line,
            column
          }
          : null;

        // 处理路径
        if (processedPath.startsWith('/') || processedPath.startsWith('~/')) {
          // 绝对路径，保持原样
          results.push({
            path: processedPath,
            startIndex: match.index,
            length: fullMatch.length,
            line,
            column,
            type,
            searchInfo
          });
        } else if (processedPath.startsWith('./') || processedPath.startsWith('../')) {
          // 相对路径，尝试转换为绝对路径
          if (vscode.workspace.workspaceFolders?.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const absolutePath = path.startsWith('.')
              ? path.replace(/^\.\//, '') // 移除开头的 ./
              : path;

            results.push({
              path: absolutePath, // 保持相对路径格式
              startIndex: match.index,
              length: fullMatch.length,
              line,
              column,
              type,
              searchInfo,
              isRelative: true,
              workspaceRoot
            });
          } else {
            // 如果没有工作区，只添加搜索信息
            results.push({
              path: null,
              startIndex: match.index,
              length: fullMatch.length,
              line,
              column,
              type,
              searchInfo
            });
          }
        } else {
          // 其他格式的路径（可能是编译错误输出等）
          results.push({
            path: null,
            startIndex: match.index,
            length: fullMatch.length,
            line,
            column,
            type,
            searchInfo
          });
        }

        logger.debug(`找到路径 [${type}]: ${processedPath}${line ? `:${line}` : ''}${column ? `:${column}` : ''}`);
      }
    }
  } catch (error) {
    logger.error(`查找路径时出错: ${error.message}`);
  }
  return results;
}

// 添加辅助函数来提取文件信息
function extractFileInfo(filePath) {
  try {
    // 移除开头的 ./ 或 ../
    const cleanPath = filePath.replace(/^(?:\.\.?\/)+/, '');

    // 匹配行号和列号
    const match = cleanPath.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
    if (match) {
      return {
        fileName: path.basename(match[1]),
        line: match[2] ? parseInt(match[2], 10) : undefined,
        column: match[3] ? parseInt(match[3], 10) : undefined
      };
    }

    return {
      fileName: path.basename(cleanPath),
      line: undefined,
      column: undefined
    };
  } catch (error) {
    logger.error(`提取文件信息时出错: ${error.message}`);
    return {
      fileName: path.basename(filePath),
      line: undefined,
      column: undefined
    };
  }
}

// 添加辅助函数来搜索和打开文件
async function searchAndOpenFile(fileName, line, column) {
  try {
    logger.info(`尝试通过搜索打开文件: ${fileName}`);

    // 先尝试在工作区中精确匹配
    const files = await vscode.workspace.findFiles(`**/${fileName}`, null, 5);

    if (files.length === 0) {
      // 如果没找到，打开搜索框
      logger.info(`未找到文件 ${fileName}，打开搜索框`);
      await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
    } else if (files.length === 1) {
      // 如果只找到一个，直接打开
      const document = await vscode.workspace.openTextDocument(files[0]);
      const editor = await vscode.window.showTextDocument(document);
      if (line !== undefined) {
        const position = new vscode.Position(line - 1, column || 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    } else {
      // 如果找到多个，让用户选择
      const items = files.map(file => ({
        label: path.basename(file.fsPath),
        description: vscode.workspace.asRelativePath(file.fsPath),
        file
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要打开的文件'
      });

      if (selected) {
        const document = await vscode.workspace.openTextDocument(selected.file);
        const editor = await vscode.window.showTextDocument(document);
        if (line !== undefined) {
          const position = new vscode.Position(line - 1, column || 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
      }
    }
  } catch (error) {
    logger.error(`搜索和打开文件时出错: ${error.message}`);
    // 作为最后的后备方案，直接打开搜索框
    await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
  }
}

// 导出激活和停用函数
exports.activate = activate;
exports.deactivate = deactivate;
