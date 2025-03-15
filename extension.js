// 'vscode' 模块包含 VS Code 扩展 API
const vscode = require('vscode');
const commandExistsSync = require('command-exists').sync;
const moment = require('moment');
const configLoader = require('./adapters/config-loader');
const { ServerTreeProvider, CommandTreeProvider } = require('./src/serverTreeProvider');
const localCommandsLoader = require('./adapters/local-commands-loader');

// 全局变量
let outputChannel = null;
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

    // 设置配置监视器
    setupConfigWatchers(context);

    // 创建树视图提供者
    serverTreeProvider = new ServerTreeProvider(servers);
    commandTreeProvider = new CommandTreeProvider(servers);

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
    outputChannel.appendLine(`[SmartSSH-SMBA] 扩展激活完成`);

    // 将树视图提供者存储为全局变量，以便其他函数可以访问
    global.serverTreeProvider = serverTreeProvider;
    global.commandTreeProvider = commandTreeProvider;

    // 将终端列表存储为全局变量，以便其他函数可以访问
    global.terminals = terminals;

    // 监听终端创建事件
    context.subscriptions.push(vscode.window.onDidOpenTerminal(terminal => {
      // 检查这个终端是否是我们创建的 SSH 终端
      const sshTerminal = terminals.find(t => t.terminal === terminal);
      if (sshTerminal) {
        // 确保全局终端列表是最新的
        global.terminals = terminals;
        outputChannel.appendLine(`终端已打开: ${sshTerminal.name}`);
      }
    }));

    // 当终端关闭时更新全局变量
    context.subscriptions.push(vscode.window.onDidCloseTerminal(event => {
      const terminal = terminals.find(t => t.terminal === event);

      if (terminal) {
        terminals = terminals.filter(t => t !== terminal);
        global.terminals = terminals; // 更新全局变量
        outputChannel.appendLine(`连接到 '${terminal.host}' 的终端已被关闭。`);
      }
    }));

    // 当服务器列表更新时刷新树视图
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('smartssh-smba.config.serverList')) {
          // 如果服务器列表配置发生变化，重新加载服务器列表
          outputChannel.appendLine('[SmartSSH-SMBA] 检测到服务器列表配置变更，正在刷新...');
          refreshServerList();
        } else if (e.affectsConfiguration('smartssh-smba.config.customCommands')) {
          // 如果自定义命令配置发生变化，刷新命令列表
          outputChannel.appendLine('[SmartSSH-SMBA] 检测到自定义命令配置变更，正在刷新...');
          refreshCommandList();
        } else if (e.affectsConfiguration('smartssh-smba.config')) {
          // 如果其他 smartssh-smba.config 配置发生变化，刷新所有视图
          outputChannel.appendLine('[SmartSSH-SMBA] 检测到其他配置变更，正在刷新...');
          refreshServerList();
          refreshCommandList();
        }
      })
    );

    // 监听本地命令文件变更
    const localCommandsWatcher = localCommandsLoader.watchLocalCommandsFile(() => {
      // 当本地命令文件变更时刷新命令树
      refreshCommandList();
    });

    if (localCommandsWatcher) {
      context.subscriptions.push(localCommandsWatcher);
    }

    // 监听配置变更
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('smartssh-smba.localCommands')) {
          // 如果本地命令配置发生变化，刷新命令列表
          outputChannel.appendLine('[SmartSSH-SMBA] 检测到本地命令配置变更，正在刷新...');
          refreshCommandList();
        }
      })
    );

    // 返回扩展 API
    return {
      getTerminals: function () {
        return terminals;
      },
    };
  } catch (error) {
    console.error('激活扩展时出错:', error);
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
    // 创建输出通道
    outputChannel = vscode.window.createOutputChannel('SmartSSH-SMBA');
    outputChannel.appendLine(`[SmartSSH-SMBA] 扩展初始化中...`);

    // 检查 SSH 命令是否存在
    const sshAvailable = checkSSHExecutable();
    if (!sshAvailable) {
      vscode.window.showErrorMessage('未找到 SSH 命令。请确保 SSH 已安装并添加到 PATH 中。');
    }

    // 加载服务器列表
    loadServerList();

    // 将终端列表存储为全局变量，以便其他函数可以访问
    global.terminals = terminals;

    outputChannel.appendLine(`[SmartSSH-SMBA] 扩展初始化完成，已加载 ${servers.length} 个服务器`);
  } catch (error) {
    console.error('初始化扩展组件时出错:', error);
    if (outputChannel) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 初始化扩展组件时出错: ${error.message}`);
    } else {
      // 如果输出通道还没有创建，则创建它
      outputChannel = vscode.window.createOutputChannel('SmartSSH-SMBA');
      outputChannel.appendLine(`[SmartSSH-SMBA] 初始化扩展组件时出错: ${error.message}`);
    }
    vscode.window.showErrorMessage(`初始化 SmartSSH-SMBA 扩展时出错: ${error.message}`);
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

    // 注册打开 SSH 连接命令的别名
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.connect', async () => {
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
          console.error('快速打开连接时出错:', error);
          if (outputChannel) {
            outputChannel.appendLine(`[SmartSSH-SMBA] 快速打开连接时出错: ${error.message}`);
          }
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

    // 注册刷新服务器列表命令的别名
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.refreshServers', () => {
        refreshServerList();
      })
    );

    // 注册刷新命令列表命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.refreshCommandList', () => {
        refreshCommandList();
      })
    );

    // 注册刷新命令列表命令的别名
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.refreshCommands', () => {
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
            outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 无法确定服务器名称: ${JSON.stringify(server)}`);
            vscode.window.showErrorMessage('无法确定服务器名称');
          }
        } catch (error) {
          outputChannel.appendLine(`[SmartSSH-SMBA] 连接到服务器时出错: ${error.message}`);
          vscode.window.showErrorMessage(`连接到服务器时出错: ${error.message}`);
        }
      })
    );

    // 注册发送命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.sendCommand', item => {
        try {
          // 如果 item 是字符串（命令文本），直接使用
          if (typeof item === 'string') {
            sendCommand(item);
            return;
          }

          // 如果 item 是对象，尝试获取命令和服务器
          let command = null;
          let server = null;
          let isCustomCommand = false;

          if (item) {
            // 检查是否是服务器自定义命令
            if (item.contextValue === 'serverCommand') {
              isCustomCommand = true;
            }

            // 尝试获取命令
            if (item.command) {
              if (typeof item.command === 'string') {
                command = item.command;
              } else if (item.command.command) {
                command = item.command.command;
              }
            } else if (item.commandObj && item.commandObj.command) {
              command = item.commandObj.command;
            } else if (item.label) {
              command = item.label;
            }

            // 尝试获取服务器
            if (item.server) {
              server = item.server;
            }
          }

          if (command) {
            sendCommand(command, server, isCustomCommand);
          } else {
            outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 无法确定命令: ${JSON.stringify(item)}`);
            vscode.window.showErrorMessage('无法确定命令');
          }
        } catch (error) {
          outputChannel.appendLine(`[SmartSSH-SMBA] 发送命令时出错: ${error.message}`);
          vscode.window.showErrorMessage(`发送命令时出错: ${error.message}`);
        }
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
      vscode.commands.registerCommand('smartssh-smba.addCommand', (isLocal) => {
        addCommand(isLocal === true);
      })
    );

    // 注册编辑命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.editCommand', (cmdObj, isLocal) => {
        editCommand(cmdObj, isLocal);
      })
    );

    // 注册删除命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.deleteCommand', (cmdName, isLocal) => {
        deleteCommand(cmdName, isLocal);
      })
    );

    // 注册打开设置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'smartssh-smba');
      })
    );

    // 注册打开设置命令的别名
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openConfiguration', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'smartssh-smba');
      })
    );

    // 注册打开本地命令设置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openLocalCommandsSettings', () => {
        vscode.commands.executeCommand(
          'workbench.action.openWorkspaceSettings',
          {
            query: 'smartssh-smba.localCommands',
          }
        );
      })
    );

    // 注册打开服务器设置命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.openServerSettings', () => {
        openServerSettings();
      })
    );

    // 注册创建本地命令配置命令
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

          // 创建或编辑本地命令配置
          const result = await createOrEditLocalCommandsConfig(targetFolder.uri.fsPath);
          if (result) {
            vscode.window.showInformationMessage(`已为工作区 ${targetFolder.name} 创建或编辑本地命令配置`);
          } else {
            vscode.window.showErrorMessage(`为工作区 ${targetFolder.name} 创建或编辑本地命令配置失败`);
          }
        } catch (error) {
          console.error('创建或编辑本地命令配置时出错:', error);
          if (outputChannel) {
            outputChannel.appendLine(`[SmartSSH-SMBA] 创建或编辑本地命令配置时出错: ${error.message}`);
          }
          vscode.window.showErrorMessage(`创建或编辑本地命令配置时出错: ${error.message}`);
        }
      })
    );

    // 注册删除本地命令命令
    context.subscriptions.push(
      vscode.commands.registerCommand('smartssh-smba.deleteLocalCommand', (cmdObj) => {
        if (cmdObj && cmdObj.commandObj && cmdObj.commandObj.name) {
          deleteCommand(cmdObj.commandObj.name, true); // true 表示这是本地命令
        } else {
          vscode.window.showErrorMessage('无法确定要删除的命令');
        }
      })
    );
  } catch (error) {
    console.error('注册命令时出错:', error);
    if (outputChannel) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 注册命令时出错: ${error.message}`);
    }
  }
}

/**
 * 设置配置监视器
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function setupConfigWatchers(context) {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在设置配置监视器...`);

    // 监听配置变更事件
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('smartssh-smba.config')) {
          outputChannel.appendLine(`[SmartSSH-SMBA] 检测到配置变更，正在重新加载...`);
          loadServerList();
        }
      })
    );

    // 设置配置加载器的监视器回调
    configLoader.setWatcherCallback(() => {
      outputChannel.appendLine(`[SmartSSH-SMBA] 检测到配置文件变更，正在重新加载...`);
      loadServerList();
    });

    // 启动配置文件监视器
    configLoader.startWatchers();

    outputChannel.appendLine(`[SmartSSH-SMBA] 配置监视器设置完成`);
  } catch (error) {
    console.error('设置配置监视器时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 设置配置监视器时出错: ${error.message}`);
  }
}

/**
 * 选择服务器
 * @returns {Promise<string|null>} - 选择的服务器名称，如果取消则返回 null
 */
async function selectServer() {
  try {
    // 如果没有服务器配置，提示用户添加
    if (!servers || servers.length === 0) {
      const result = await vscode.window.showInformationMessage(
        '没有配置服务器。是否添加服务器？',
        '添加服务器',
        '取消'
      );

      if (result === '添加服务器') {
        addServer();
      }

      return null;
    }

    // 如果只有一个服务器，直接返回
    if (servers.length === 1) {
      return servers[0].name;
    }

    // 获取配置
    const configData = configLoader.loadConfig();
    const showHostsInPickLists = configData.showHostsInPickLists !== undefined ? configData.showHostsInPickLists : false;

    // 创建服务器选择列表
    const serverItems = servers.map(server => ({
      label: showHostsInPickLists ? `${server.configuration.username}@${server.configuration.host}` : server.name,
      description: showHostsInPickLists ? server.name : `${server.configuration.username}@${server.configuration.host}`,
      name: server.name,
    }));

    // 显示服务器选择列表
    const selected = await vscode.window.showQuickPick(serverItems, {
      placeHolder: '选择服务器',
    });

    if (!selected) {
      return null; // 用户取消
    }

    return selected.name;
  } catch (error) {
    console.error('选择服务器时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 选择服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`选择服务器时出错: ${error.message}`);
    return null;
  }
}

/**
 * 从配置加载服务器列表
 * @param {Object|string} source - 配置源
 * @returns {Boolean} - 成功状态
 */
function loadServerList(source) {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在加载服务器列表...`);

    // 获取配置
    const configData = configLoader.loadConfig();

    // 从配置中获取服务器列表
    servers = configData.serverList.map(server => ({
      name: server.name,
      configuration: server,
    })) || [];

    outputChannel.appendLine(`[SmartSSH-SMBA] 已加载 ${servers.length} 个服务器`);

    // 更新树视图提供者
    updateTreeProviders();

    // 更新状态栏按钮
    updateStatusBarButton();

    return true;
  } catch (error) {
    console.error('加载服务器列表时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 加载服务器列表时出错: ${error.message}`);
    return false;
  }
}

/**
 * 更新树视图提供者
 */
function updateTreeProviders() {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在更新树视图提供者...`);

    // 更新服务器树视图
    if (serverTreeProvider) {
      serverTreeProvider.servers = servers;
      serverTreeProvider.refresh();
      outputChannel.appendLine(`[SmartSSH-SMBA] 服务器树视图已更新`);
    }

    // 更新命令树视图
    if (commandTreeProvider) {
      commandTreeProvider.refresh();
      outputChannel.appendLine(`[SmartSSH-SMBA] 命令树视图已更新`);
    }
  } catch (error) {
    console.error('更新树视图提供者时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 更新树视图提供者时出错: ${error.message}`);
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
      outputChannel.appendLine(`[SmartSSH-SMBA] 在系统上找到了 SSH 命令`);
    } else {
      outputChannel.appendLine(`[SmartSSH-SMBA] 在系统上未找到 SSH 命令`);
    }

    outputChannel.appendLine(`[SmartSSH-SMBA] 如果您使用第三方终端，请确保其中有 SSH 工具`);

    return checkResult;
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 检查 SSH 命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 打开到指定服务器的 SSH 连接
 * @param {string} serverName - 服务器名称
 * @param {Boolean} isFastConnection - 是否为快速连接
 * @returns {Promise<Boolean>} - 是否有错误的 Promise
 */
function openSSHConnection(serverName, isFastConnection) {
  return new Promise(resolve => {
    if (serverName === undefined) {
      resolve(false);
      return;
    }

    try {
      // 检查 SSH 命令是否可用
      if (!checkSSHExecutable()) {
        vscode.window.showErrorMessage('未找到 SSH 命令。请确保 SSH 已安装并添加到 PATH 中。');
        resolve(false);
        return;
      }

      // 查找服务器配置
      const server = servers.find(s => s.name === serverName);
      if (!server) {
        outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 找不到服务器 ${serverName}`);
        vscode.window.showErrorMessage(`找不到服务器 ${serverName}`);
        resolve(false);
        return;
      }

      const terminal = terminals.find(element => element.name === serverName);

      let terminalIsNew = true;
      let hasErrors = false;

      if (terminal === undefined || vscode.workspace.getConfiguration('smartssh-smba').allowMultipleConnections) {
        outputChannel.appendLine('为 \'' + server.configuration.host + '\' 初始化新的终端会话...');

        if (server.configuration.host === undefined || server.configuration.username === undefined) {
          outputChannel.appendLine('请检查 \'' + server.configuration.host + '\' 的主机或用户名');
          hasErrors = true;
        }

        if (!hasErrors) {
          // 构建 SSH 命令
          const { sshCommand, authMethod } = buildSSHCommand(server.configuration);

          // 创建新终端
          const newTerminal = vscode.window.createTerminal(serverName);

          // 添加到终端列表
          terminals.push({
            name: serverName,
            username: server.configuration.username,
            host: server.configuration.host,
            terminal: newTerminal,
          });

          // 更新全局终端列表
          global.terminals = terminals;

          // 发送 SSH 命令
          newTerminal.sendText(sshCommand);

          // 根据授权方式处理
          if (authMethod === 'byPassword') {
            // 如果使用密码认证，自动发送密码
            if (server.configuration.password) {
              setTimeout(() => {
                newTerminal.sendText(server.configuration.password);
              }, 1000);
            } else {
              // 如果没有配置密码，提示用户手动输入
              setTimeout(() => {
                outputChannel.appendLine('请在终端中输入密码进行认证');
                vscode.window.showInformationMessage(`请在终端中输入密码连接到 ${server.configuration.host}`);
              }, 1000);
            }
          }

          newTerminal.show();
        }
      } else {
        terminal.terminal.show();
        terminalIsNew = false;
      }

      if (!hasErrors) {
        outputChannel.appendLine('连接到 \'' + server.configuration.host +
          '\' 的终端已' + ((terminalIsNew) ? '创建并显示' : '显示。'));
      } else {
        outputChannel.appendLine('连接到 \'' + server.configuration.host +
          '\' 的终端未启动，因为发现了错误。');

        vscode.window.showErrorMessage('终端未启动，请查看输出获取更多信息。', '查看输出')
          .then(() => {
            outputChannel.show();
          });
      }

      resolve(hasErrors);
    } catch (error) {
      console.error('打开 SSH 连接时出错:', error);
      outputChannel.appendLine(`[SmartSSH-SMBA] 打开 SSH 连接时出错: ${error.message}`);
      vscode.window.showErrorMessage(`打开 SSH 连接时出错: ${error.message}`);
      resolve(false);
    }
  });
}

/**
 * 构建 SSH 命令字符串
 * @param {Object} serverConfig - 服务器配置
 * @returns {Object} - SSH 命令和授权方式
 */
function buildSSHCommand(serverConfig) {
  let sshCommand = 'ssh ' + serverConfig.host + ' -l ' + serverConfig.username;
  let authMethod = 'byPassword'; // 默认使用密码认证

  // 如果端口不是默认端口，则添加端口
  if (serverConfig.port !== undefined && serverConfig.port && serverConfig.port !== 22) {
    sshCommand += ' -p ' + serverConfig.port;
  }

  // 确定授权方式
  if (serverConfig.agent !== undefined && serverConfig.agent) {
    // 通过代理授权
    authMethod = 'byAgent';
  }

  // 通过私钥授权
  if (serverConfig.privateKey !== undefined && serverConfig.privateKey) {
    sshCommand += ' -i "' + serverConfig.privateKey + '"';
    authMethod = 'byPrivateKey';
  }

  const remoteCommands = [];

  // 处理 SMB 映射以自动更改目录
  const remotePath = getRemotePathFromSmbMapping(serverConfig);
  if (remotePath) {
    remoteCommands.push('cd ' + remotePath);
  } else if (serverConfig.path !== undefined) {
    // 如果没有 SMB 映射但有配置路径，则使用配置的路径
    remoteCommands.push('cd ' + serverConfig.path);
  }

  // 添加自定义命令
  if (serverConfig.initCommands !== undefined && serverConfig.initCommands.length) {
    remoteCommands.push(...serverConfig.initCommands);
  } else if (serverConfig.customCommands !== undefined && serverConfig.customCommands.length) {
    remoteCommands.push(...serverConfig.customCommands);
  }

  // 将远程命令添加到 SSH 命令
  if (remoteCommands.length > 0) {
    sshCommand += ' -t "' + remoteCommands.map(x => x + '; ').join('') + 'eval $(echo \'$SHELL\') --login"';
  }

  return { sshCommand, authMethod };
}

/**
 * 从 SMB 映射获取远程路径
 * @param {Object} serverConfig - 服务器配置
 * @returns {string|null} - 远程路径或 null
 */
function getRemotePathFromSmbMapping(serverConfig) {
  // 如果未配置 SMB 映射，则返回 null
  if (!serverConfig.smbMapping) {
    return null;
  }

  // 获取当前工作区文件夹
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return serverConfig.smbMapping.remotePath; // 如果没有工作区，则默认为配置的远程路径
  }

  // 获取当前工作区路径
  const currentWorkspacePath = workspaceFolders[0].uri.fsPath;

  // 标准化路径以确保一致的格式
  let normalizedLocalPath = serverConfig.smbMapping.localPath.replace(/\\/g, '/');
  let normalizedWorkspacePath = currentWorkspacePath.replace(/\\/g, '/');
  const normalizedRemotePath = serverConfig.smbMapping.remotePath.replace(/\/+$/, '');

  // 处理 Windows 驱动器盘符（例如 C:）
  // 移除驱动器盘符部分进行比较
  if (/^[a-zA-Z]:/.test(normalizedLocalPath)) {
    const localDrive = normalizedLocalPath.substring(0, 2).toUpperCase();
    const workspaceDrive = normalizedWorkspacePath.substring(0, 2).toUpperCase();

    // 确保工作区和本地路径在同一个驱动器上
    if (localDrive === workspaceDrive) {
      // 移除驱动器盘符以便正确比较路径
      normalizedLocalPath = normalizedLocalPath.substring(2);
      normalizedWorkspacePath = normalizedWorkspacePath.substring(2);
    } else {
      // 如果不在同一个驱动器上，则无法映射
      outputChannel.appendLine(`工作区路径 ${currentWorkspacePath} 与配置的 SMB 路径 ${serverConfig.smbMapping.localPath} 不在同一个驱动器上`);
      return serverConfig.smbMapping.remotePath;
    }
  }

  // 移除末尾的斜杠
  normalizedLocalPath = normalizedLocalPath.replace(/\/+$/, '');

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
    // 例如：如果 localPath 是 C:/ProgramFiles 而工作区是 C:/ProgramFiles/github/c_converter
    // 则应该映射到 /home/root/github/c_converter
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

  // 如果不在 SMB 路径中，则返回默认远程路径
  outputChannel.appendLine(`无法映射工作区路径 ${currentWorkspacePath} 到远程路径`);
  return serverConfig.smbMapping.remotePath;
}

/**
 * 刷新服务器列表
 */
function refreshServerList() {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在刷新服务器列表...`);

    // 调用 loadServerList 函数
    loadServerList();

    outputChannel.appendLine(`[SmartSSH-SMBA] 服务器列表刷新完成，加载了 ${servers.length} 个服务器`);
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 刷新服务器列表时出错: ${error.message}`);
    vscode.window.showErrorMessage(`刷新服务器列表时出错: ${error.message}`);
  }
}

/**
 * 刷新命令列表
 */
function refreshCommandList() {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在刷新命令列表...`);

    // 刷新命令树视图
    if (commandTreeProvider) {
      commandTreeProvider.refresh();
      outputChannel.appendLine(`[SmartSSH-SMBA] 命令列表刷新完成`);
    }
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 刷新命令列表时出错: ${error.message}`);
    vscode.window.showErrorMessage(`刷新命令列表时出错: ${error.message}`);
  }
}

/**
 * 创建或编辑本地命令配置
 * @param {string} folderPath - 工作区文件夹路径
 * @returns {Promise<boolean>} - 是否成功创建或编辑
 */
async function createOrEditLocalCommandsConfig(folderPath) {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在创建或编辑本地命令配置: ${folderPath}`);

    // 调用 localCommandsLoader.createLocalCommandsConfig 函数
    const result = await localCommandsLoader.createLocalCommandsConfig(folderPath);

    if (result) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 本地命令配置创建或编辑成功`);
      // 刷新命令列表
      refreshCommandList();
    } else {
      outputChannel.appendLine(`[SmartSSH-SMBA] 本地命令配置创建或编辑失败`);
    }

    return result;
  } catch (error) {
    console.error('创建或编辑本地命令配置时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 创建或编辑本地命令配置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除命令
 * @param {string} cmdName - 命令名称
 * @param {boolean} isLocal - 是否为本地命令
 */
async function deleteCommand(cmdName, isLocal) {
  try {
    if (!cmdName) {
      vscode.window.showErrorMessage('命令名称为空');
      return;
    }

    // 确认删除
    const confirm = await vscode.window.showWarningMessage(
      `确定要删除${isLocal ? '本地' : '全局'}命令 "${cmdName}" 吗？`,
      { modal: true },
      '删除'
    );

    if (confirm !== '删除') {
      return; // 用户取消
    }

    if (isLocal) {
      // 删除本地命令
      // 获取当前工作区
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('没有打开的工作区');
        return;
      }

      // 如果有多个工作区，提示用户选择
      let workspace;

      if (workspaceFolders.length === 1) {
        workspace = workspaceFolders[0];
      } else {
        const workspaceItems = workspaceFolders.map(folder => ({
          label: folder.name,
          description: folder.uri.fsPath,
          folder,
        }));

        const selected = await vscode.window.showQuickPick(workspaceItems, {
          placeHolder: '选择工作区'
        });

        if (!selected) {
          return; // 用户取消
        }

        workspace = selected.folder;
      }

      // 获取工作区配置
      const workspaceConfig = vscode.workspace.getConfiguration('smartssh-smba', workspace.uri);
      const localCommands = workspaceConfig.get('localCommands') || [];

      // 查找命令
      const cmdIndex = localCommands.findIndex(cmd => cmd.name === cmdName);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到本地命令 "${cmdName}"`);
        return;
      }

      // 删除命令
      localCommands.splice(cmdIndex, 1);

      // 更新配置
      await workspaceConfig.update('localCommands', localCommands, vscode.ConfigurationTarget.WorkspaceFolder);
    } else {
      // 删除全局命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands || [];

      // 查找命令
      const cmdIndex = customCommands.findIndex(cmd => cmd.name === cmdName);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到全局命令 "${cmdName}"`);
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

    vscode.window.showInformationMessage(`已删除${isLocal ? '本地' : '全局'}命令 "${cmdName}"`);
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 删除${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
  }
}

/**
 * 更新状态栏按钮
 */
function updateStatusBarButton() {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 正在更新状态栏按钮...`);

    // 如果按钮不存在，创建它
    if (!fastOpenConnectionButton) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 创建状态栏按钮...`);
      fastOpenConnectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      fastOpenConnectionButton.command = 'smartssh-smba.fastOpenConnection';
    }

    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;

    // 如果没有活动的编辑器，显示通用按钮
    if (!editor) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 没有活动的编辑器，显示通用按钮`);
      fastOpenConnectionButton.text = `$(terminal) SSH 连接`;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
      return;
    }

    // 获取当前文件的路径
    const filePath = editor.document.uri.fsPath;

    // 如果没有文件路径，显示通用按钮
    if (!filePath) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 无法获取文件路径，显示通用按钮`);
      fastOpenConnectionButton.text = `$(terminal) SSH 连接`;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
      return;
    }

    outputChannel.appendLine(`[SmartSSH-SMBA] 当前文件路径: ${filePath}`);
    outputChannel.appendLine(`[SmartSSH-SMBA] 服务器数量: ${servers ? servers.length : 0}`);

    // 查找匹配的服务器
    const matchedServer = findServerForPath(filePath);

    // 如果找到匹配的服务器，显示特定服务器的按钮
    if (matchedServer) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 找到匹配的服务器: ${matchedServer.name}，显示特定按钮`);
      fastOpenConnectionButton.text = `$(terminal) ${matchedServer.name}`;
      fastOpenConnectionButton.tooltip = `打开到 ${matchedServer.name} 的 SSH 连接`;
    } else {
      // 如果没有找到匹配的服务器，显示通用按钮
      outputChannel.appendLine(`[SmartSSH-SMBA] 没有匹配的服务器，显示通用按钮`);
      fastOpenConnectionButton.text = `$(terminal) SSH 连接`;
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    }

    // 始终显示按钮
    fastOpenConnectionButton.show();
  } catch (error) {
    console.error('更新状态栏按钮时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 更新状态栏按钮时出错: ${error.message}`);
    outputChannel.appendLine(`[SmartSSH-SMBA] 错误堆栈: ${error.stack}`);
  }
}

/**
 * 查找与文件路径匹配的服务器
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器对象，如果没有匹配则返回 null
 */
function findServerForPath(filePath) {
  try {
    outputChannel.appendLine(`[SmartSSH-SMBA] 查找匹配文件路径的服务器: ${filePath}`);

    // 如果没有服务器配置，返回 null
    if (!servers || servers.length === 0) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 没有服务器配置`);
      return null;
    }

    // 规范化文件路径
    const normalizedPath = filePath.replace(/\\/g, '/');
    outputChannel.appendLine(`[SmartSSH-SMBA] 规范化后的文件路径: ${normalizedPath}`);

    // 遍历所有服务器，查找匹配的 SMB 映射
    for (const server of servers) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 检查服务器: ${server.name}`);

      // 检查服务器是否有 SMB 映射配置
      if (server.configuration && server.configuration.smbMapping) {
        const mapping = server.configuration.smbMapping;
        outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${server.name} 有 SMB 映射配置`);

        // 检查本地路径是否配置
        if (mapping.localPath) {
          // 规范化本地路径
          const localPath = mapping.localPath.replace(/\\/g, '/');
          outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${server.name} 的本地路径: ${localPath}`);

          // 检查文件路径是否在本地路径下
          if (normalizedPath.startsWith(localPath)) {
            outputChannel.appendLine(`[SmartSSH-SMBA] 找到匹配的服务器: ${server.name}, 本地路径: ${localPath}`);
            return server;
          } else {
            outputChannel.appendLine(`[SmartSSH-SMBA] 文件路径不在服务器 ${server.name} 的本地路径下`);
          }
        } else {
          outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${server.name} 没有配置本地路径`);
        }
      } else {
        outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${server.name} 没有 SMB 映射配置`);
      }
    }

    outputChannel.appendLine(`[SmartSSH-SMBA] 没有找到匹配的服务器`);
    return null;
  } catch (error) {
    console.error('查找匹配服务器时出错:', error);
    outputChannel.appendLine(`[SmartSSH-SMBA] 查找匹配服务器时出错: ${error.message}`);
    outputChannel.appendLine(`[SmartSSH-SMBA] 错误堆栈: ${error.stack}`);
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
    outputChannel.appendLine(`[SmartSSH-SMBA] 添加服务器时出错: ${error.message}`);
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
    outputChannel.appendLine(`[SmartSSH-SMBA] 编辑服务器时出错: ${error.message}`);
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
    outputChannel.appendLine(`[SmartSSH-SMBA] 删除服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`删除服务器时出错: ${error.message}`);
  }
}

/**
 * 添加命令
 * @param {boolean} isLocal - 是否为本地命令
 */
async function addCommand(isLocal) {
  try {
    // 提示用户输入命令名称
    const name = await vscode.window.showInputBox({
      prompt: `输入${isLocal ? '本地' : '全局'}命令名称`,
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
    };

    if (isLocal) {
      // 添加本地命令
      // 获取当前工作区
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('没有打开的工作区');
        return;
      }

      // 如果有多个工作区，提示用户选择
      let workspace;

      if (workspaceFolders.length === 1) {
        workspace = workspaceFolders[0];
      } else {
        const workspaceItems = workspaceFolders.map(folder => ({
          label: folder.name,
          description: folder.uri.fsPath,
          folder,
        }));

        const selected = await vscode.window.showQuickPick(workspaceItems, {
          placeHolder: '选择工作区',
        });

        if (!selected) {
          return; // 用户取消
        }

        workspace = selected.folder;
      }

      // 获取工作区配置
      const workspaceConfig = vscode.workspace.getConfiguration('smartssh-smba', workspace.uri);
      const localCommands = workspaceConfig.get('localCommands') || [];

      // 检查名称是否已存在
      if (localCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`本地命令名称 "${name}" 已存在`);
        return;
      }

      // 添加命令
      localCommands.push(cmdObj);

      // 更新配置
      await workspaceConfig.update('localCommands', localCommands, vscode.ConfigurationTarget.WorkspaceFolder);

      // 添加工作区信息
      cmdObj.workspaceFolder = workspace.name;
    } else {
      // 添加全局命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands || [];

      // 检查名称是否已存在
      if (customCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`全局命令名称 "${name}" 已存在`);
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

    vscode.window.showInformationMessage(`已添加${isLocal ? '本地' : '全局'}命令 "${name}"`);
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 添加${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`添加${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
  }
}

/**
 * 编辑命令
 * @param {Object} cmdObj - 命令对象
 * @param {boolean} isLocal - 是否为本地命令
 */
async function editCommand(cmdObj, isLocal) {
  try {
    if (!cmdObj) {
      vscode.window.showErrorMessage('命令对象为空');
      return;
    }

    // 提示用户输入新的命令名称
    const name = await vscode.window.showInputBox({
      prompt: `输入${isLocal ? '本地' : '全局'}命令名称`,
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
    };

    if (isLocal) {
      // 编辑本地命令
      // 获取当前工作区
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('没有打开的工作区');
        return;
      }

      // 如果有多个工作区，提示用户选择
      let workspace;

      if (workspaceFolders.length === 1) {
        workspace = workspaceFolders[0];
      } else if (cmdObj.workspaceFolder) {
        // 如果命令对象有工作区信息，使用该工作区
        workspace = workspaceFolders.find(folder => folder.name === cmdObj.workspaceFolder);

        if (!workspace) {
          vscode.window.showErrorMessage(`找不到工作区 "${cmdObj.workspaceFolder}"`);
          return;
        }
      } else {
        const workspaceItems = workspaceFolders.map(folder => ({
          label: folder.name,
          description: folder.uri.fsPath,
          folder,
        }));

        const selected = await vscode.window.showQuickPick(workspaceItems, {
          placeHolder: '选择工作区',
        });

        if (!selected) {
          return; // 用户取消
        }

        workspace = selected.folder;
      }

      // 获取工作区配置
      const workspaceConfig = vscode.workspace.getConfiguration('smartssh-smba', workspace.uri);
      const localCommands = workspaceConfig.get('localCommands') || [];

      // 查找命令
      const cmdIndex = localCommands.findIndex(cmd => cmd.name === cmdObj.name);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到本地命令 "${cmdObj.name}"`);
        return;
      }

      // 如果名称已更改，检查是否已存在
      if (name !== cmdObj.name && localCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`本地命令名称 "${name}" 已存在`);
        return;
      }

      // 更新命令
      localCommands[cmdIndex] = updatedCmd;

      // 更新配置
      await workspaceConfig.update('localCommands', localCommands, vscode.ConfigurationTarget.WorkspaceFolder);

      // 添加工作区信息
      updatedCmd.workspaceFolder = workspace.name;
    } else {
      // 编辑全局命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands || [];

      // 查找命令
      const cmdIndex = customCommands.findIndex(cmd => cmd.name === cmdObj.name);

      if (cmdIndex === -1) {
        vscode.window.showErrorMessage(`找不到全局命令 "${cmdObj.name}"`);
        return;
      }

      // 如果名称已更改，检查是否已存在
      if (name !== cmdObj.name && customCommands.some(cmd => cmd.name === name)) {
        vscode.window.showErrorMessage(`全局命令名称 "${name}" 已存在`);
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

    vscode.window.showInformationMessage(`已更新${isLocal ? '本地' : '全局'}命令 "${name}"`);
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 编辑${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
    vscode.window.showErrorMessage(`编辑${isLocal ? '本地' : '全局'}命令时出错: ${error.message}`);
  }
}

/**
 * 打开服务器设置
 */
function openServerSettings() {
  try {
    // 打开设置页面，并聚焦到 smartssh-smba.config.serverList 设置
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'smartssh-smba.config.serverList'
    );

    outputChannel.appendLine(`[SmartSSH-SMBA] 已打开服务器设置页面`);
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 打开服务器设置页面时出错: ${error.message}`);
    vscode.window.showErrorMessage(`打开服务器设置页面时出错: ${error.message}`);
  }
}

/**
 * 发送命令到服务器
 * @param {Object|string} cmdObj - 命令对象或命令字符串
 * @param {Object} server - 服务器对象
 * @param {boolean} isCustomCommand - 是否是服务器的自定义命令
 */
async function sendCommand(cmdObj, server, isCustomCommand = false) {
  try {
    // 如果 cmdObj 是字符串，转换为命令对象
    if (typeof cmdObj === 'string') {
      cmdObj = {
        name: cmdObj,
        command: cmdObj,
        description: '',
      };
    }

    // 检查命令对象是否有 command 属性
    if (!cmdObj || !cmdObj.command) {
      outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 命令对象无效 ${JSON.stringify(cmdObj)}`);
      vscode.window.showErrorMessage('命令对象无效');
      return;
    }

    // 如果提供了服务器对象，则发送到特定服务器
    if (server) {
      let serverName = null;

      // 如果 server 是字符串，则直接使用
      if (typeof server === 'string') {
        serverName = server;
      } else if (server.name) {
        // 如果 server 是对象且有 name 属性，则使用 name 属性
        serverName = server.name;
      } else if (server.configuration && server.configuration.name) {
        // 如果 server 是配置对象，则使用配置中的 name 属性
        serverName = server.configuration.name;
      }

      if (!serverName) {
        outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 无法确定服务器名称`);
        vscode.window.showErrorMessage('无法确定服务器名称');
        return;
      }

      // 查找服务器的终端
      const terminal = terminals.find(t => t.name === serverName);

      if (!terminal) {
        // 如果终端不存在且是自定义命令，直接连接服务器
        if (isCustomCommand) {
          outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${serverName} 的终端不存在，正在打开新连接...`);
          await openSSHConnection(serverName);
          // 自定义命令会在连接时自动执行，所以这里不需要再发送命令
          return;
        } else {
          // 如果不是自定义命令，询问用户是否要连接
          const result = await vscode.window.showInformationMessage(
            `服务器 ${serverName} 未连接。是否连接?`,
            '连接',
            '取消'
          );

          if (result !== '连接') {
            return; // 用户取消
          }

          // 打开新的连接
          outputChannel.appendLine(`[SmartSSH-SMBA] 服务器 ${serverName} 的终端不存在，正在打开新连接...`);
          await openSSHConnection(serverName);

          // 等待终端创建完成
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 如果是自定义命令且服务器已连接，或者不是自定义命令
      if (!isCustomCommand || terminal) {
        // 重新查找终端（可能是新创建的）
        const updatedTerminal = terminals.find(t => t.name === serverName);

        if (updatedTerminal) {
          // 发送命令到终端
          updatedTerminal.terminal.show();
          updatedTerminal.terminal.sendText(cmdObj.command);
          outputChannel.appendLine(`[SmartSSH-SMBA] 已发送命令到服务器 ${serverName}: ${cmdObj.command}`);
        } else {
          outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 无法找到服务器 ${serverName} 的终端`);
          vscode.window.showErrorMessage(`无法找到服务器 ${serverName} 的终端`);
        }
      }
    } else {
      // 如果没有提供服务器，则检查是否有活动的 SSH 终端
      if (terminals.length > 0) {
        // 如果有多个终端，让用户选择
        let targetTerminal;

        if (terminals.length === 1) {
          targetTerminal = terminals[0];
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
          } else {
            // 否则让用户选择
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
              return; // 用户取消
            }

            targetTerminal = selected.terminal;
          }
        }

        // 发送命令到选定的终端
        targetTerminal.terminal.show();
        targetTerminal.terminal.sendText(cmdObj.command);
        outputChannel.appendLine(`[SmartSSH-SMBA] 已发送命令到终端 ${targetTerminal.name}: ${cmdObj.command}`);
      } else {
        // 如果没有 SSH 终端，询问用户是否要连接服务器
        const result = await vscode.window.showInformationMessage(
          '没有活动的 SSH 连接。是否连接服务器?',
          '连接',
          '发送到本地终端',
          '取消'
        );

        if (result === '连接') {
          // 选择服务器并连接
          const serverName = await selectServer();

          if (!serverName) {
            return; // 用户取消
          }

          // 打开连接
          await openSSHConnection(serverName);

          // 等待终端创建完成
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 查找新创建的终端
          const newTerminal = terminals.find(t => t.name === serverName);

          if (newTerminal) {
            // 发送命令到新终端
            newTerminal.terminal.show();
            newTerminal.terminal.sendText(cmdObj.command);
            outputChannel.appendLine(`[SmartSSH-SMBA] 已发送命令到服务器 ${serverName}: ${cmdObj.command}`);
          } else {
            outputChannel.appendLine(`[SmartSSH-SMBA] 错误: 无法找到服务器 ${serverName} 的终端`);
            vscode.window.showErrorMessage(`无法找到服务器 ${serverName} 的终端`);
          }
        } else if (result === '发送到本地终端') {
          // 发送到活动终端或创建新终端
          const activeTerminal = vscode.window.activeTerminal;

          if (activeTerminal) {
            activeTerminal.show();
            activeTerminal.sendText(cmdObj.command);
            outputChannel.appendLine(`[SmartSSH-SMBA] 已发送命令到活动终端: ${cmdObj.command}`);
          } else {
            // 如果没有活动终端，则创建新终端
            const newTerminal = vscode.window.createTerminal('SmartSSH-SMBA Command');
            newTerminal.show();
            newTerminal.sendText(cmdObj.command);
            outputChannel.appendLine(`[SmartSSH-SMBA] 已创建新终端并发送命令: ${cmdObj.command}`);
          }
        } else {
          // 用户取消
          return;
        }
      }
    }
  } catch (error) {
    outputChannel.appendLine(`[SmartSSH-SMBA] 发送命令时出错: ${error.message}`);
    outputChannel.appendLine(`[SmartSSH-SMBA] 错误堆栈: ${error.stack}`);
    vscode.window.showErrorMessage(`发送命令时出错: ${error.message}`);
  }
}

// 导出激活和停用函数
exports.activate = activate;
exports.deactivate = deactivate;
