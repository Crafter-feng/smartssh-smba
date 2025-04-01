/**
 * 终端管理模块
 * 处理所有与终端相关的功能
 */

const vscode = require('vscode');
const { logger } = require('../utils/logger');
const { convertLocalPathToRemote } = require('../utils/path-utils');
const configLoader = require('../utils/config-loader');

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
      } else if (server.agent) {
        args.push('-A');
        authMethod = 'byAgent';
        logger.debug('使用SSH代理认证');
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
   * 在终端中执行命令
   * @param {Object} command - 命令对象 { command: 'xxx', name: 'xxx' }
   * @returns {Promise<boolean>} - 执行结果
   */
  async executeCommandInTerminal(command) {
    try {
      logger.debug('executeCommandInTerminal', { command });
      
      // 验证命令有效性
      if (!command) {
        logger.warn('无效的命令: null');
        return false;
      }
      
      // 获取命令文本
      let commandText = '';
      if (typeof command === 'string') {
        // 如果是字符串命令
        commandText = command;
      } else if (typeof command === 'object') {
        if (command.command) {
          commandText = command.command;
        } else {
          logger.warn('无效的命令对象格式');
          return false;
        }
      } else {
        logger.warn('无效的命令类型');
        return false;
      }
      
      // 创建或找到本地终端
      const terminal = this.findOrCreateLocalTerminal('Command Terminal');
      
      if (!terminal) {
        logger.error('无法创建或找到本地终端');
        return false;
      }
      
      // 发送命令到终端
      terminal.show();
      terminal.sendText(commandText);
      
      logger.info(`命令 ${commandText} 已发送到终端`);
      return true;
    } catch (error) {
      logger.error(`executeCommandInTerminal 出错: ${error.message}`);
      return false;
    }
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
}

// 创建并导出终端管理器实例
const terminalManager = new TerminalManager();
module.exports = terminalManager;
