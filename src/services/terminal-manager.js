/**
 * 终端管理模块
 * 处理所有与终端相关的功能
 */

const vscode = require('vscode');
const { logger } = require('../utils/logger');
const { convertLocalPathToRemote } = require('../utils/path-utils');
const configLoader = require('../adapters/config-loader');

// 全局存储所有连接的终端
let globalTerminals = new Map();
let terminalCounter = 0;

// 事件处理器
const eventHandlers = {
  terminalCreated: [],
  terminalClosed: []
};

// 终端管理器
class TerminalManager {
  constructor() {
    // 终端记录 - 使用全局变量
    this.terminals = globalTerminals;

    // 监听终端关闭事件
    vscode.window.onDidCloseTerminal(this.handleTerminalClose.bind(this));
  }

  /**
   * 添加终端创建事件监听器
   * @param {Function} callback - 事件回调函数
   * @returns {Function} - 移除监听器的函数
   */
  onTerminalCreated(callback) {
    if (typeof callback === 'function') {
      eventHandlers.terminalCreated.push(callback);
      return () => {
        const index = eventHandlers.terminalCreated.indexOf(callback);
        if (index !== -1) {
          eventHandlers.terminalCreated.splice(index, 1);
        }
      };
    }
    return () => { };
  }

  /**
   * 添加终端关闭事件监听器
   * @param {Function} callback - 事件回调函数
   * @returns {Function} - 移除监听器的函数
   */
  onTerminalClosed(callback) {
    if (typeof callback === 'function') {
      eventHandlers.terminalClosed.push(callback);
      return () => {
        const index = eventHandlers.terminalClosed.indexOf(callback);
        if (index !== -1) {
          eventHandlers.terminalClosed.splice(index, 1);
        }
      };
    }
    return () => { };
  }

  /**
   * 触发终端创建事件
   * @param {Object} data - 事件数据
   */
  _triggerTerminalCreated(data) {
    try {
      for (const handler of eventHandlers.terminalCreated) {
        handler(data);
      }
    } catch (error) {
      logger.error(`触发终端创建事件时出错: ${error.message}`);
    }
  }

  /**
   * 触发终端关闭事件
   * @param {Object} data - 事件数据
   */
  _triggerTerminalClosed(data) {
    try {
      for (const handler of eventHandlers.terminalClosed) {
        handler(data);
      }
    } catch (error) {
      logger.error(`触发终端关闭事件时出错: ${error.message}`);
    }
  }

  /**
   * 处理终端关闭事件
   * @param {vscode.Terminal} terminal - 关闭的终端
   */
  handleTerminalClose(terminal) {
    try {
      // 从记录中移除终端
      let removedKey = null;
      let isSSH = false;
      let serverName = null;

      for (const [name, details] of this.terminals.entries()) {
        if (details.terminal === terminal) {
          isSSH = details.metadata && details.metadata.type === 'ssh';
          serverName = isSSH ? (details.metadata.serverName || name.split(':')[0]) : null;

          this.terminals.delete(name);
          logger.info(`终端 ${name} 已关闭`);
          removedKey = name;
          break;
        }
      }

      // 如果是SSH终端，记录日志
      if (removedKey && removedKey.includes(':SSH')) {
        logger.info(`SSH连接 ${removedKey} 已断开`);

        // 触发终端关闭事件
        this._triggerTerminalClosed({
          name: removedKey,
          isSSH,
          serverName
        });
      }
    } catch (error) {
      logger.error(`处理终端关闭事件时出错: ${error.message}`);
    }
  }

  /**
   * 添加终端记录
   * @param {string} name - 终端名称
   * @param {vscode.Terminal} terminal - 终端对象
   * @param {Object} metadata - 终端元数据
   * @returns {string} - 实际使用的终端名称
   */
  addTerminal(name, terminal, metadata = {}) {
    try {
      // 如果是SSH终端，为每个连接生成唯一标识符
      let terminalName = name;
      if (metadata.type === 'ssh') {
        // 为同一服务器的多个连接生成唯一名称
        terminalCounter++;
        if (metadata.server) {
          terminalName = `${name}:SSH:${terminalCounter}`;
          // 添加服务器信息到元数据
          metadata.serverName = name;
          metadata.serverInfo = metadata.server;
        }
      }

      this.terminals.set(terminalName, {
        terminal,
        metadata,
        createdAt: new Date(),
      });

      logger.info(`已添加终端 ${terminalName} 到管理器`);

      // 如果是SSH终端，触发创建事件
      if (metadata.type === 'ssh') {
        this._triggerTerminalCreated({
          name: terminalName,
          isSSH: true,
          serverName: metadata.serverName || name
        });
      }

      return terminalName;
    } catch (error) {
      logger.error(`添加终端记录时出错: ${error.message}`);
      return name;
    }
  }

  /**
   * 根据名称查找终端
   * @param {string} name - 终端名称
   * @returns {vscode.Terminal|null} - 找到的终端，如果未找到则返回null
   */
  findTerminalByName(name) {
    try {
      const details = this.terminals.get(name);
      return details ? details.terminal : null;
    } catch (error) {
      logger.error(`查找终端时出错: ${error.message}`);
      return null;
    }
  }

  /**
   * 根据服务器名称查找所有相关终端
   * @param {string} serverName - 服务器名称
   * @returns {Array} - 找到的终端数组
   */
  findTerminalsByServerName(serverName) {
    try {
      const result = [];
      for (const [name, details] of this.terminals.entries()) {
        if (details.metadata &&
          details.metadata.type === 'ssh' &&
          (details.metadata.serverName === serverName || name === serverName)) {
          result.push({
            name,
            terminal: details.terminal,
            metadata: details.metadata,
          });
        }
      }
      return result;
    } catch (error) {
      logger.error(`查找服务器终端时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取当前活动的SSH终端
   * @returns {Object|null} - 活动的SSH终端信息
   */
  getActiveSSHTerminal() {
    try {
      const activeTerminal = vscode.window.activeTerminal;
      if (!activeTerminal) return null;

      for (const [name, details] of this.terminals.entries()) {
        if (details.terminal === activeTerminal &&
          details.metadata &&
          details.metadata.type === 'ssh') {
          return {
            name,
            terminal: details.terminal,
            metadata: details.metadata,
          };
        }
      }
      return null;
    } catch (error) {
      logger.error(`获取活动SSH终端时出错: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取所有SSH终端
   * @returns {Array} - SSH终端数组
   */
  getAllSSHTerminals() {
    try {
      const result = [];
      for (const [name, details] of this.terminals.entries()) {
        if (details.metadata && details.metadata.type === 'ssh') {
          // 提取服务器名信息，优先使用metadata中的serverName，而不是从终端名称中解析
          const serverName = details.metadata.serverName ||
            (details.metadata.serverInfo ? details.metadata.serverInfo.name : null) ||
            name.split(':')[0];

          result.push({
            name,
            terminal: details.terminal,
            metadata: details.metadata,
            serverName: serverName,
          });
        }
      }
      return result;
    } catch (error) {
      logger.error(`获取所有SSH终端时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取所有可用的终端（包括SSH和本地）
   * @returns {Array} - 终端数组
   */
  getAllTerminals() {
    const result = [];
    try {
      for (const [name, details] of this.terminals.entries()) {
        result.push({
          name,
          terminal: details.terminal,
          isSSH: details.metadata && details.metadata.type === 'ssh',
          serverName: details.metadata && details.metadata.type === 'ssh' ? details.metadata.serverName || name.split(':')[0] : null,
        });
      }
    } catch (error) {
      logger.error('获取所有终端时出错:', error);
    }
    return result;
  }

  /**
   * 获取所有终端（向后兼容）
   * @returns {vscode.Terminal[]} - 终端列表
   */
  getTerminals() {
    try {
      const terminalArray = [];

      // 获取所有SSH终端
      const sshTerminals = this.getAllSSHTerminals();
      for (const termInfo of sshTerminals) {
        if (termInfo.terminal) {
          // 将name和description等信息添加到终端对象
          const terminal = termInfo.terminal;
          terminal.name = termInfo.name;
          terminal.description = termInfo.metadata && termInfo.metadata.serverInfo
            ? `${termInfo.metadata.serverInfo.username}@${termInfo.metadata.serverInfo.host}`
            : '';
          terminal.serverName = termInfo.serverName;
          terminalArray.push(terminal);
        }
      }

      return terminalArray;
    } catch (error) {
      logger.error(`获取终端列表时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 创建SSH终端
   * @param {Object} server - 服务器配置
   * @returns {vscode.Terminal|null} - 创建的终端，如果失败则返回null
   */
  createSshTerminal(server) {
    try {
      if (!server || !server.name || !server.host || !server.username) {
        logger.error('服务器配置无效');
        return null;
      }

      // 构建SSH命令
      const sshCommand = this.buildSshCommand(server);

      // 创建终端名称
      const baseName = server.name;
      // 终端计数器已在全局变量中维护

      // 创建终端
      const terminal = vscode.window.createTerminal({
        name: baseName,
        shellPath: process.platform === 'win32' ? 'cmd.exe' : 'bash',
      });
      terminal.show();
      // 添加到记录
      const terminalName = this.addTerminal(server.name, terminal, {
        type: 'ssh',
        server,
      });

      // 执行SSH命令
      const fullCommand = `${sshCommand.command} ${sshCommand.args.join(' ')}`;
      terminal.sendText(fullCommand);

      // 如果使用密码认证，处理密码
      if (sshCommand.authMethod === 'byPassword' && server.password) {
        setTimeout(() => {
          terminal.sendText(server.password);
        }, 1000);
      }

      return terminal;
    } catch (error) {
      logger.error(`创建SSH终端时出错: ${error.message}`);
      return null;
    }
  }

  /**
   * 构建SSH命令
   * @param {Object} server - 服务器配置
   * @returns {Object} - SSH命令信息
   */
  buildSshCommand(server) {
    try {
      logger.debug('buildSshCommand', { serverName: server?.name });
      // 检查服务器配置
      if (!server) {
        return { command: 'ssh', args: [], authMethod: 'byKey' };
      }

      // 构建基本命令
      let command = 'ssh';
      const args = [];
      let authMethod = 'none';

      // 添加端口参数
      if (server.port && server.port !== 22) {
        args.push('-p');
        args.push(server.port.toString());
        logger.debug(`使用非标准SSH端口: ${server.port}`);
      }

      // 处理认证方式
      if (server.privateKey) {
        args.push('-i');
        args.push(server.privateKey);
        authMethod = 'byKey';
        logger.debug(`使用密钥认证: ${server.privateKey}`);
      } else {
        // 默认使用密码或系统配置的密钥
        authMethod = 'byPassword';
        logger.debug('使用密码认证或系统默认密钥');
      }

      // 添加用户名和主机
      const destination = `${server.username}@${server.host}`;
      args.push(destination);
      logger.debug(`SSH目标: ${destination}`);

      // 处理远程命令
      const remoteCommands = [];
      logger.debug('开始构建远程命令...');

      // 处理路径映射以自动更改目录
      let remotePath = null;

      // 获取当前工作区路径
      const currentWorkspacePath = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : null;

      if (currentWorkspacePath) {
        logger.debug(`当前工作区路径: ${currentWorkspacePath}`);

        // 使用convertLocalPathToRemote函数转换路径
        remotePath = convertLocalPathToRemote(currentWorkspacePath, server);

        if (remotePath) {
          logger.debug(`转换后的远程路径: ${remotePath}`);

          // 使用单引号包围路径，防止特殊字符解析问题
          const cdCommand = `cd '${remotePath.replace(/'/g, '\'\\\'\'')}'`;
          remoteCommands.push(cdCommand);
          logger.debug(`添加CD命令: ${cdCommand}`);
        }
      }

      // 添加初始化命令
      if (server.initCommands && server.initCommands.length > 0) {
        logger.debug(`服务器有 ${server.initCommands.length} 个初始化命令`);
        for (const cmd of server.initCommands) {
          // 处理命令对象或字符串
          const commandText = typeof cmd === 'object' ? cmd.command : cmd;
          remoteCommands.push(`"${commandText}"`);
          logger.debug(`添加初始化命令: ${commandText}`);
        }
      }

      // 添加启动交互式shell的命令
      remoteCommands.push('eval $(echo \'$SHELL\') --login');
      logger.debug('添加启动交互式shell的命令');

      // 构建命令字符串，每个命令后面加分号
      const commandString = remoteCommands.map(cmd => `${cmd};`).join(' ');
      logger.debug(`完整的远程命令字符串: ${commandString}`);

      // 添加-t参数和命令字符串
      args.push('-t');
      args.push(commandString);

      const result = {
        command: command,
        args: args,
        authMethod: authMethod,
      };
      logger.debug('SSH命令构建完成', { command, args });
      logger.debug('buildSshCommand 结束，没有错误');
      return result;
    } catch (error) {
      logger.error(`构建SSH命令时出错: ${error.message}`, error);
      logger.debug('buildSshCommand 结束，发生错误', { error: error.message });
      return {
        command: 'ssh',
        args: [],
        authMethod: 'byKey'
      };
    }
  }

  /**
   * 创建本地终端
   * @param {string} name - 终端名称，可选
   * @returns {vscode.Terminal|null} - 创建的终端，如果失败则返回null
   */
  createLocalTerminal(name = 'Local Terminal') {
    try {
      // 创建终端
      const terminal = vscode.window.createTerminal({
        name,
      });

      // 添加到记录
      this.addTerminal(name, terminal, {
        type: 'local',
      });

      return terminal;
    } catch (error) {
      logger.error(`创建本地终端时出错: ${error.message}`);
      return null;
    }
  }

  /**
   * 查找或创建本地终端
   * @param {string} name - 终端名称，可选
   * @returns {vscode.Terminal|null} - 终端对象，如果失败则返回null
   */
  findOrCreateLocalTerminal(name = 'Local Terminal') {
    try {
      // 查找已存在的终端
      const existingTerminal = this.findTerminalByName(name);
      if (existingTerminal) {
        return existingTerminal;
      }

      // 创建新终端
      return this.createLocalTerminal(name);
    } catch (error) {
      logger.error(`查找或创建本地终端时出错: ${error.message}`);
      return null;
    }
  }

  /**
   * 关闭指定终端
   * @param {string} name - 终端名称
   * @returns {boolean} - 是否成功关闭
   */
  closeTerminal(name) {
    try {
      const terminal = this.findTerminalByName(name);
      if (terminal) {
        terminal.dispose();
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`关闭终端时出错: ${error.message}`);
      return false;
    }
  }

  /**
   * 关闭所有终端
   */
  closeAllTerminals() {
    try {
      for (const [name, details] of this.terminals.entries()) {
        if (details.terminal) {
          details.terminal.dispose();
        }
      }
      this.terminals.clear();
      logger.info('已关闭所有终端');
    } catch (error) {
      logger.error(`关闭所有终端时出错: ${error.message}`);
    }
  }

  /**
   * 根据VSCode终端实例查找对应的终端信息
   * @param {vscode.Terminal} terminal VSCode终端实例
   * @returns {Object|null} 终端信息或null
   */
  findTerminalByVscodeTerminal(terminal) {
    try {
      for (const [name, details] of this.terminals.entries()) {
        if (details.terminal === terminal) {
          return {
            name,
            terminal: details.terminal,
            isSSH: details.metadata && details.metadata.type === 'ssh',
            serverName: details.metadata && details.metadata.type === 'ssh' ? details.metadata.serverName || name.split(':')[0] : null,
          };
        }
      }
    } catch (error) {
      logger.error('根据VSCode终端查找终端信息时出错:', error);
    }
    return null;
  }

  /**
   * 连接到服务器
   * @param {string} serverName - 服务器名称
   * @param {boolean} [showQuickPick=true] - 是否显示快速选择对话框
   * @returns {Promise<boolean>} - 是否成功连接
   */
  async connectToServer(serverName, showQuickPick = true) {
    try {
      // 获取服务器列表
      const serverList = configLoader.getServerList();
      if (!serverList || serverList.length === 0) {
        vscode.window.showInformationMessage('没有配置服务器，请先添加服务器');
        return false;
      }

      // 如果只有一个服务器，直接连接
      if (serverList.length === 1) {
        const serverConfig = serverList[0];
        this.createSshTerminal(serverConfig);
        return true;
      }

      // 如果有多个服务器且指定了服务器名称，直接连接
      if (serverName) {
        const serverConfig = await configLoader.getServerByName(serverName);
        if (!serverConfig) {
          throw new Error(`找不到服务器: ${serverName}`);
        }
        this.createSshTerminal(serverConfig);
        return true;
      }

      // 如果有多个服务器且需要显示选择对话框
      if (showQuickPick) {
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
          const selectedServerName = selection.label;
          const serverConfig = await configLoader.getServerByName(selectedServerName);
          if (!serverConfig) {
            throw new Error(`找不到服务器: ${selectedServerName}`);
          }
          this.createSshTerminal(serverConfig);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`连接到服务器失败: ${error.message}`);
      vscode.window.showErrorMessage(`连接到服务器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取或创建SSH终端
   * @param {string|Object} serverParam - 服务器名称或服务器对象
   * @param {boolean} [showQuickPick=true] - 是否显示快速选择对话框
   * @returns {Promise<Object>} - 返回包含终端、服务器名称和连接状态的对象
   */
  async getOrCreateSSHTerminal(serverParam, showQuickPick = true) {
    try {
      let serverName = null;
      let server = null;
      let isNewConnection = false;

      // 解析服务器参数
      if (typeof serverParam === 'string') {
        // 如果是字符串，作为服务器名称
        serverName = serverParam;
      } else if (serverParam && typeof serverParam === 'object') {
        // 如果是对象，尝试获取服务器名称
        if (serverParam.name) {
          serverName = serverParam.name;
          server = serverParam;
        } else if (serverParam.label) {
          serverName = serverParam.label;
        } else if (serverParam.server && serverParam.server.name) {
          serverName = serverParam.server.name;
          server = serverParam.server;
        } else if (serverParam.configuration && serverParam.configuration.name) {
          serverName = serverParam.configuration.name;
          server = serverParam.configuration;
        }
      }

      // 如果有服务器名称，先检查是否已连接
      if (serverName) {
        logger.debug(`检查服务器 ${serverName} 是否已连接`);

        // 查找该服务器的所有终端
        const serverTerminals = this.findTerminalsByServerName(serverName);

        // 如果已有终端连接
        if (serverTerminals.length > 0) {
          logger.debug(`服务器 ${serverName} 已有 ${serverTerminals.length} 个连接`);

          // 首先检查活动终端是否是该服务器的终端
          const activeSSHTerminal = this.getActiveSSHTerminal();
          if (activeSSHTerminal &&
            activeSSHTerminal.metadata &&
            activeSSHTerminal.metadata.serverName === serverName) {
            logger.debug(`使用活动的SSH终端 ${activeSSHTerminal.name}`);
            activeSSHTerminal.terminal.show();
            return {
              terminal: activeSSHTerminal.terminal,
              serverName,
              isNewConnection: false
            };
          }

          // 否则使用第一个找到的终端
          logger.debug(`使用第一个找到的SSH终端 ${serverTerminals[0].name}`);
          return {
            terminal: serverTerminals[0].terminal,
            serverName,
            isNewConnection: false
          };
        }

        // 如果没有终端连接，创建新连接
        logger.info(`服务器 ${serverName} 未连接，正在连接...`);

        // 如果已经有server对象，直接使用
        if (!server) {
          server = await configLoader.getServerByName(serverName);
          if (!server) {
            logger.error(`找不到服务器: ${serverName}`);
          }
        }

        // 创建SSH终端
        const terminal = this.createSshTerminal(server);
        if (!terminal) {
          logger.error(`无法创建到服务器 ${serverName} 的终端`);
        }

        isNewConnection = true;
        return {
          terminal,
          serverName,
          isNewConnection
        };
      }

      // 如果没有指定服务器，获取所有SSH终端
      const sshTerminals = this.getAllSSHTerminals();

      // 如果有SSH终端
      if (sshTerminals.length > 0) {
        // 如果只有一个SSH终端，直接使用
        if (sshTerminals.length === 1) {
          logger.debug(`使用唯一的SSH终端 ${sshTerminals[0].name}`);
          sshTerminals[0].terminal.show();
          return {
            terminal: sshTerminals[0].terminal,
            serverName: sshTerminals[0].serverName,
            isNewConnection: false
          };
        }

        // 如果有活动的SSH终端，优先使用
        const activeSSHTerminal = this.getActiveSSHTerminal();
        if (activeSSHTerminal) {
          logger.debug(`使用活动的SSH终端 ${activeSSHTerminal.name}`);
          activeSSHTerminal.terminal.show();
          return {
            terminal: activeSSHTerminal.terminal,
            serverName: activeSSHTerminal.metadata ? activeSSHTerminal.metadata.serverName : null,
            isNewConnection: false
          };
        }

        // 如果需要显示选择对话框且有多个SSH终端
        if (showQuickPick) {
          // 创建选择项
          const terminalItems = sshTerminals.map(t => ({
            label: t.serverName || t.name.split(':')[0],
            description: t.metadata && t.metadata.serverInfo ?
              `${t.metadata.serverInfo.username}@${t.metadata.serverInfo.host}` : '',
            detail: t.name,
            terminal: t.terminal
          }));

          // 显示快速选择
          const selected = await vscode.window.showQuickPick(
            terminalItems,
            { placeHolder: '选择目标SSH终端' }
          );

          if (selected) {
            logger.debug(`用户选择了SSH终端 ${selected.label}`);
            return {
              terminal: selected.terminal,
              serverName: selected.label,
              isNewConnection: false
            };
          }
        }
      }

      // 如果没有SSH终端或用户取消选择
      if (showQuickPick) {
        // 询问用户是否连接新服务器
        const result = await vscode.window.showInformationMessage(
          '没有活动的SSH连接。请选择操作:',
          '连接服务器',
          '使用当前终端',
          '取消'
        );

        if (result === '连接服务器') {
          // 获取服务器列表
          const serverList = configLoader.getServerList();
          if (!serverList || serverList.length === 0) {
            vscode.window.showInformationMessage('没有配置服务器，请先添加服务器');
            return { terminal: null, serverName: null, isNewConnection: false };
          }

          // 如果只有一个服务器，直接连接
          if (serverList.length === 1) {
            const serverConfig = serverList[0];
            const terminal = this.createSshTerminal(serverConfig);
            if (terminal) {
              terminal.show();
              return {
                terminal,
                serverName: serverConfig.name,
                isNewConnection: true
              };
            }
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

            const terminal = this.createSshTerminal(serverConfig);
            if (terminal) {
              return {
                terminal,
                serverName,
                isNewConnection: true
              };
            }
          }
        } else if (result === '使用当前终端') {
          // 使用当前活动的终端，如果没有则创建一个
          const activeTerminal = vscode.window.activeTerminal;
          if (activeTerminal) {
            return {
              terminal: activeTerminal,
              serverName: null,
              isNewConnection: false
            };
          } else {
            const localTerminal = this.findOrCreateLocalTerminal('Command Terminal');
            localTerminal.show();
            return {
              terminal: localTerminal,
              serverName: null,
              isNewConnection: true
            };
          }
        }
      }

      // 如果没有可用终端或用户取消
      return { terminal: null, serverName: null, isNewConnection: false };
    } catch (error) {
      logger.error(`获取SSH终端时出错: ${error.message}`);
      vscode.window.showErrorMessage(`获取SSH终端时出错: ${error.message}`);
      return { terminal: null, serverName: null, isNewConnection: false };
    }
  }
}

// 创建并导出终端管理器实例
const terminalManager = new TerminalManager();
module.exports = terminalManager;
