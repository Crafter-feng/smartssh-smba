/* eslint-disable no-useless-escape */
/* eslint-disable @stylistic/brace-style */
/* eslint-disable @stylistic/comma-dangle */
// 'vscode' 模块包含 VS Code 扩展 API
const vscode = require('vscode');
const fs = require('fs').promises;
const commandExistsSync = require('command-exists').sync;
const configLoader = require('./adapters/config-loader');
const { ServerTreeProvider, CommandTreeProvider } = require('./src/serverTreeProvider');
const { logger, LogLevel, LogTarget } = require('./adapters/logger');

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

    // 使用统一的 smbMappingList 处理逻辑
    if (serverConfig.smbMappingList && serverConfig.smbMappingList.length > 0) {
      for (const mapping of serverConfig.smbMappingList) {
        if (!mapping || !mapping.localPath || !mapping.remotePath) {
          continue;
        }

        // 标准化路径
        let normalizedWorkspacePath = currentWorkspacePath.replace(/\\/g, '/');
        let normalizedLocalPath = mapping.localPath.replace(/\\/g, '/');
        let normalizedRemotePath = mapping.remotePath.replace(/\\/g, '/');

        // 处理 Windows 驱动器盘符
        const workspaceDrive = /^[a-zA-Z]:/.test(normalizedWorkspacePath)
          ? normalizedWorkspacePath.substring(0, 2).toUpperCase()
          : '';

        if (workspaceDrive) {
          normalizedWorkspacePath = normalizedWorkspacePath.substring(2);
        }

        // 确保路径以斜杠开头
        if (!normalizedWorkspacePath.startsWith('/')) {
          normalizedWorkspacePath = '/' + normalizedWorkspacePath;
        }

        if (!normalizedLocalPath.startsWith('/')) {
          normalizedLocalPath = '/' + normalizedLocalPath;
        }

        if (!normalizedRemotePath.startsWith('/')) {
          normalizedRemotePath = '/' + normalizedRemotePath;
        }

        // 处理 Windows 驱动器盘符
        const localDrive = /^[a-zA-Z]:/.test(normalizedLocalPath)
          ? normalizedLocalPath.substring(0, 2).toUpperCase()
          : '';

        // 确保工作区和本地路径在同一个驱动器上（如果有驱动器）
        if (workspaceDrive && localDrive && workspaceDrive !== localDrive) {
          continue;
        }

        if (localDrive) {
          normalizedLocalPath = normalizedLocalPath.substring(2);
        }

        // 检查当前工作区是否在本地 SMB 路径内
        if (normalizedWorkspacePath.startsWith(normalizedLocalPath)) {
          // 计算相对于本地 SMB 根目录的相对路径
          let relativePath = normalizedWorkspacePath.substring(normalizedLocalPath.length);

          // 确保相对路径以斜杠开头
          if (!relativePath.startsWith('/')) {
            relativePath = '/' + relativePath;
          }

          // 与远程路径连接，确保正确的路径分隔符
          return normalizedRemotePath + relativePath;
        } else {
          // 尝试直接替换路径前缀
          const pathParts = normalizedWorkspacePath.split('/').filter(Boolean);
          const localPathParts = normalizedLocalPath.split('/').filter(Boolean);

          // 查找公共路径部分
          let commonIndex = 0;
          while (commonIndex < localPathParts.length &&
            commonIndex < pathParts.length &&
            localPathParts[commonIndex] === pathParts[commonIndex]) {
            commonIndex++;
          }

          if (commonIndex > 0) {
            // 构建相对路径
            const relativePathParts = pathParts.slice(commonIndex);
            const relativePath = '/' + relativePathParts.join('/');
            return normalizedRemotePath + relativePath;
          }
        }
      }

      // 如果所有映射都不匹配，使用第一个映射的远程路径作为默认值
      // 添加检查确保第一个映射有远程路径
      if (serverConfig.smbMappingList[0] && serverConfig.smbMappingList[0].remotePath) {
        logger.warn('无法映射工作区路径 ' + currentWorkspacePath + ' 到远程路径，使用默认远程路径');
        return serverConfig.smbMappingList[0].remotePath;
      }
    }

    // 如果没有配置路径映射，但有配置路径，则使用配置的路径
    if (serverConfig.path) {
      return serverConfig.path;
    }

    // 如果没有任何路径配置，返回 null
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

    // 使用统一的 smbMappingList 处理逻辑
    if (server.configuration.smbMappingList && server.configuration.smbMappingList.length > 0) {
      // 遍历所有映射，找到匹配的映射关系
      for (const mapping of server.configuration.smbMappingList) {
        if (mapping && mapping.remotePath && mapping.localPath && remotePath.startsWith(mapping.remotePath)) {
          return remotePath.replace(mapping.remotePath, mapping.localPath);
        }
      }
    }

    // 如果没有找到匹配的映射，返回null
    return null;
  } catch (error) {
    logger.error('转换远程路径时出错:', error);
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
  const disposable = vscode.commands.registerCommand('smartssh-smba.openMappedFile', async (filePath, serverName) => {
    try {
      logger.info(`尝试打开映射文件: ${filePath}`);

      // 确定要使用的服务器
      let server = null;

      // 如果提供了服务器名称，直接使用
      if (serverName) {
        server = servers.find(s => s.name === serverName);
      } else {
        // 否则尝试从活动终端获取
        const activeTerminal = vscode.window.activeTerminal ? terminals.find(t => t.terminal === vscode.window.activeTerminal) : null;
        if (activeTerminal) {
          server = servers.find(s => s.name === activeTerminal.name);
        }
      }

      if (!server) {
        logger.warn('没有活动的服务器连接');
        return;
      }

      // 转换路径
      const localPath = convertRemotePathToLocal(filePath, server);
      if (!localPath) {
        logger.warn(`无法转换路径: ${filePath}`);
        return;
      }

      // 检查文件是否存在
      const { exists, isDirectory } = await checkPathExists(localPath);

      if (!exists) {
        // 文件不存在时，直接不处理
        logger.warn(`文件不存在: ${localPath}`);
        return;
      }

      // 根据路径类型执行不同操作
      if (isDirectory) {
        // 如果是目录，尝试在 VS Code 中打开
        logger.info(`打开文件夹: ${localPath}`);

        // 检查是否是工作区的文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const path = require('path');
        const isWorkspaceFolder = workspaceFolders.some(folder => {
          const folderPath = folder.uri.fsPath;
          return localPath === folderPath || localPath.startsWith(folderPath + path.sep);
        });

        if (isWorkspaceFolder) {
          // 如果是工作区文件夹，使用 VS Code 的 explorer.reveal 命令
          const uri = vscode.Uri.file(localPath);
          await vscode.commands.executeCommand('revealInExplorer', uri);
        } else {
          // 如果不是工作区文件夹，尝试添加到工作区
          const uri = vscode.Uri.file(localPath);
          const openInNewWindow = await vscode.window.showQuickPick(
            ['在当前窗口打开', '在新窗口打开', '添加到工作区', '在文件浏览器中打开'],
            { placeHolder: '如何打开文件夹?' }
          );

          if (openInNewWindow === '在新窗口打开') {
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
          } else if (openInNewWindow === '在当前窗口打开') {
            await vscode.commands.executeCommand('vscode.openFolder', uri, false);
          } else if (openInNewWindow === '添加到工作区') {
            await vscode.workspace.updateWorkspaceFolders(
              workspaceFolders.length,
              null,
              { uri }
            );
          } else if (openInNewWindow === '在文件浏览器中打开') {
            await vscode.commands.executeCommand('revealFileInOS', uri);
          }
        }
      } else {
        // 如果是文件，打开文件
        logger.info(`打开文件: ${localPath}`);
        try {
          const document = await vscode.workspace.openTextDocument(localPath);
          await vscode.window.showTextDocument(document);
        } catch (error) {
          // 如果是二进制文件或其他无法用文本编辑器打开的文件，尝试用系统默认程序打开
          logger.warn(`无法在编辑器中打开文件: ${error.message}，尝试用系统默认程序打开`);
          const uri = vscode.Uri.file(localPath);
          await vscode.commands.executeCommand('revealFileInOS', uri);
        }
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

      // 如果没有活动终端，不提供链接
      if (!activeTerminal) {
        return links;
      }

      // 获取活动终端对应的服务器
      const activeServer = servers.find(s => s.name === activeTerminal.name);

      // 如果没有找到对应的服务器或服务器没有配置 SMB 映射，不提供链接
      if (!activeServer || !activeServer.configuration || !activeServer.configuration.smbMapping || !activeServer.configuration.smbMapping.remotePath) {
        return links;
      }

      // 获取远程路径前缀
      const prefix = activeServer.configuration.smbMapping.remotePath;

      // 多步骤匹配策略
      // 步骤1: 尝试找出所有可能的路径
      const potentialPaths = findPotentialPaths(context.line, prefix);

      // 步骤2: 处理每个潜在路径
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
    handleTerminalLink: link => {
      const { filePath, line, column, serverName } = link.data;

      // 调用我们的命令来处理路径转换和文件打开
      vscode.commands.executeCommand('smartssh-smba.openMappedFile', filePath, serverName)
        .then(() => {
          // 如果有行号和列号，移动光标到指定位置
          if (line !== undefined && vscode.window.activeTextEditor) {
            const position = new vscode.Position(line, column || 0);
            const selection = new vscode.Selection(position, position);

            vscode.window.activeTextEditor.selection = selection;
            vscode.window.activeTextEditor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter
            );
          }
        })
        .catch(error => {
          logger.error(`处理终端链接时出错: ${error.message}`);
        });
    }
  });

  context.subscriptions.push(termLinkProvider);
}

/**
 * 在文本中查找所有路径（包括特定前缀路径和通用路径）
 * @param {string} text - 要搜索的文本
 * @param {string} [prefix] - 可选的远程路径前缀
 * @returns {Array} - 找到的路径信息数组
 */
function findPotentialPaths(text, prefix = null) {
  const results = [];

  try {
    // 记录调试信息
    logger.debug(`查找路径，文本长度: ${text.length}, 前缀: ${prefix || '无'}`);

    // 步骤1: 将文本按空白字符和常见分隔符分割成多个部分
    const parts = text.split(/[\s:"'<>|,;()[\]{}]/);

    // 步骤2: 遍历每个部分，查找路径
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      // 跳过空部分
      if (!part) continue;

      // 检查是否是路径
      let isPath = false;
      let pathStart = 0;

      // 如果提供了前缀，先检查是否包含前缀
      if (prefix && part.includes(prefix)) {
        isPath = true;
        pathStart = part.indexOf(prefix);
      }
      // 否则检查是否是通用 Unix 路径（以 / 开头，包含至少一个额外的路径段）
      else if (part.startsWith('/') && part.includes('/', 1)) {
        isPath = true;
        pathStart = 0;
      }

      if (!isPath) continue;

      // 提取路径
      let path = part.substring(pathStart);

      // 清理路径
      path = cleanupPath(path);

      // 如果是前缀路径，确保路径至少包含前缀和一个额外的路径段
      if (prefix && path.startsWith(prefix) &&
        (path.length <= prefix.length || !path.includes('/', prefix.length))) {
        continue;
      }

      // 计算在原始文本中的位置
      const startIndex = text.indexOf(path);
      if (startIndex === -1) continue;

      // 检查是否有行列号
      let line = undefined;
      let column = undefined;
      let endIndex = startIndex + path.length;

      // 查找行列号
      if (endIndex < text.length) {
        const afterPath = text.substring(endIndex);
        const lineColMatch = afterPath.match(/^:(\d+)(?::(\d+))?/);

        if (lineColMatch) {
          line = parseInt(lineColMatch[1]) - 1;
          if (lineColMatch[2]) {
            column = parseInt(lineColMatch[2]) - 1;
          }

          // 调整匹配长度以包含行列号
          endIndex += lineColMatch[0].length;
        }
      }

      // 添加到结果（避免重复）
      const isDuplicate = results.some(r => r.path === path);
      const isUrl = /^https?:\/\/|^ftp:\/\/|^ftps:\/\/|^file:\/\//.test(path);
      if (!isDuplicate && !isUrl) {
        results.push({
          path: path,
          startIndex: startIndex,
          length: endIndex - startIndex,
          line: line,
          column: column,
          isPrefixPath: prefix && path.startsWith(prefix)
        });

        logger.debug(`找到路径: ${path}, 位置: ${startIndex}-${endIndex}`);
      }
    }

    // 步骤3: 如果上述方法没有找到路径，尝试使用正则表达式
    if (results.length === 0) {
      logger.debug('使用分割方法未找到路径，尝试使用正则表达式');

      // 创建正则表达式列表
      const regexList = [];

      // 如果有前缀，添加前缀路径正则表达式
      if (prefix) {
        const escapedPrefix = escapeRegExp(prefix);
        regexList.push(new RegExp(`(${escapedPrefix}[^\\s:"'<>|,;()\\[\\]{}]*)`, 'g'));
      }

      // 添加通用 Unix 路径正则表达式
      regexList.push(/\/([\w\-\.]+\/)+[\w\-\._]*/g);

      // 遍历每个正则表达式
      for (const regex of regexList) {
        let match;

        while ((match = regex.exec(text)) !== null) {
          let path = match[0];

          // 清理路径
          path = cleanupPath(path);

          // 如果是前缀路径，确保路径至少包含前缀和一个额外的路径段
          if (prefix && path.startsWith(prefix) &&
            (path.length <= prefix.length || !path.includes('/', prefix.length))) {
            continue;
          }

          const startIndex = match.index;
          let endIndex = startIndex + path.length;

          // 检查是否有行列号
          let line = undefined;
          let column = undefined;

          if (endIndex < text.length) {
            const afterPath = text.substring(endIndex);
            const lineColMatch = afterPath.match(/^:(\d+)(?::(\d+))?/);

            if (lineColMatch) {
              line = parseInt(lineColMatch[1]) - 1;
              if (lineColMatch[2]) {
                column = parseInt(lineColMatch[2]) - 1;
              }

              // 调整匹配长度以包含行列号
              endIndex += lineColMatch[0].length;
            }
          }

          // 添加到结果（避免重复）
          const isDuplicate = results.some(r => r.path === path);
          const isUrl = /^https?:\/\/|^ftp:\/\/|^ftps:\/\/|^file:\/\//.test(path);
          if (!isDuplicate && !isUrl) {
            results.push({
              path: path,
              startIndex: startIndex,
              length: endIndex - startIndex,
              line: line,
              column: column,
              isPrefixPath: prefix && path.startsWith(prefix)
            });

            logger.debug(`使用正则表达式找到路径: ${path}, 位置: ${startIndex}-${endIndex}`);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`查找路径时出错: ${error.message}`);
  }

  return results;
}

/**
 * 清理路径，移除尾部的标点符号等
 * @param {string} path - 要清理的路径
 * @returns {string} - 清理后的路径
 */
function cleanupPath(path) {
  // 移除尾部的标点符号
  path = path.replace(/[.,;:'"!?]+$/, '');

  // 确保路径不以 / 结尾
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  return path;
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 要转义的字符串
 * @returns {string} - 转义后的字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 导出激活和停用函数
exports.activate = activate;
exports.deactivate = deactivate;
