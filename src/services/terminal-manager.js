/**
 * 终端管理模块
 * 处理所有与终端相关的功能
 */

const vscode = require('vscode');
const { logger } = require('../../adapters/logger');

// 终端管理器
class TerminalManager {
  constructor() {
    // 终端记录
    this.terminals = new Map();
    
    // 监听终端关闭事件
    vscode.window.onDidCloseTerminal(this.handleTerminalClose.bind(this));
  }
  
  /**
   * 处理终端关闭事件
   * @param {vscode.Terminal} terminal - 关闭的终端
   */
  handleTerminalClose(terminal) {
    try {
      // 从记录中移除终端
      for (const [name, details] of this.terminals.entries()) {
        if (details.terminal === terminal) {
          this.terminals.delete(name);
          logger.info(`终端 ${name} 已关闭`);
          break;
        }
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
   */
  addTerminal(name, terminal, metadata = {}) {
    try {
      this.terminals.set(name, {
        terminal,
        metadata,
        createdAt: new Date(),
      });
      
      logger.info(`已添加终端 ${name} 到管理器`);
    } catch (error) {
      logger.error(`添加终端记录时出错: ${error.message}`);
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
      
      // 创建终端
      const terminal = vscode.window.createTerminal({
        name: server.name,
        shellPath: process.platform === 'win32' ? 'cmd.exe' : 'bash',
      });
      
      // 添加到记录
      this.addTerminal(server.name, terminal, {
        type: 'ssh',
        server,
      });
      
      // 执行SSH命令
      terminal.sendText(sshCommand);
      
      // 执行初始化命令
      if (server.initCommands && Array.isArray(server.initCommands) && server.initCommands.length > 0) {
        // 延迟执行初始化命令，等待SSH连接建立
        setTimeout(() => {
          for (const cmd of server.initCommands) {
            if (cmd && typeof cmd === 'string') {
              terminal.sendText(cmd);
            }
          }
        }, 2000);
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
   * @returns {string} - SSH命令
   */
  buildSshCommand(server) {
    try {
      let command = 'ssh';
      
      // 添加用户名和主机
      command += ` ${server.username}@${server.host}`;
      
      // 添加端口
      if (server.port && server.port !== 22) {
        command += ` -p ${server.port}`;
      }
      
      // 添加私钥
      if (server.privateKey) {
        command += ` -i "${server.privateKey}"`;
      }
      
      // 添加代理设置
      if (server.agent) {
        command += ' -A';
      }
      
      return command;
    } catch (error) {
      logger.error(`构建SSH命令时出错: ${error.message}`);
      return 'ssh';
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
   * 获取所有终端列表
   * @returns {Array} - 终端列表
   */
  getAllTerminals() {
    try {
      const result = [];
      for (const [name, details] of this.terminals.entries()) {
        result.push({
          name,
          type: details.metadata.type || 'unknown',
          createdAt: details.createdAt,
          metadata: details.metadata,
        });
      }
      return result;
    } catch (error) {
      logger.error(`获取终端列表时出错: ${error.message}`);
      return [];
    }
  }
}

// 创建终端管理器实例
const terminalManager = new TerminalManager();

module.exports = terminalManager; 