/**
 * SSH服务模块
 * 处理所有与SSH连接相关的功能
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const terminalManager = require('./terminal-manager');
const pathConverter = require('./path-converter');
const { logger } = require('../utils/logger');
const commandExistsSync = require('command-exists').sync;
const configLoader = require('../adapters/config-loader');

/**
 * 打开SSH终端
 * @param {Object} server - 服务器配置
 * @returns {Promise<Object>} - 打开终端结果
 */
async function openTerminal(server) {
  try {
    if (!server) {
      throw new Error('未指定服务器');
    }

    const terminal = terminalManager.createSshTerminal(server);

    if (!terminal) {
      throw new Error('无法创建SSH终端');
    }

    terminal.show();

    return { success: true, terminal };
  } catch (error) {
    logger.error(`打开SSH终端时出错: ${error.message}`);
    throw error;
  }
}

/**
 * 连接到服务器
 * @param {string} serverName - 服务器名称
 * @param {boolean} force - 是否强制新建终端
 * @returns {Promise<Object>} - 连接结果
 */
async function connectToServer(serverName, force = false) {
  try {
    // 检查SSH可执行文件
    if (!checkSSHExecutable()) {
      throw new Error('未找到SSH命令');
    }

    // 获取服务器配置
    const serverList = getServerList();
    const server = serverList.find(s => s.name === serverName);

    if (!server) {
      throw new Error(`未找到服务器 ${serverName}`);
    }

    // 如果不是强制创建新终端，尝试查找现有的终端
    if (!force) {
      const existingTerminals = terminalManager.findTerminalsByServerName(serverName);
      if (existingTerminals.length > 0) {
        // 使用第一个发现的终端
        const existingTerminal = existingTerminals[0].terminal;
        existingTerminal.show();
        logger.info(`已使用现有终端连接到服务器 ${serverName}`);
        return { success: true, terminal: existingTerminal, isNew: false };
      }
    }

    // 打开新终端
    const result = await openTerminal(server);

    logger.info(`成功连接到服务器 ${serverName}`);
    return { success: true, terminal: result.terminal, isNew: true };
  } catch (error) {
    logger.error(`连接到服务器时出错: ${error.message}`);
    vscode.window.showErrorMessage(`连接到服务器时出错: ${error.message}`);
    throw error;
  }
}

/**
 * 检查SSH可执行文件
 * @returns {boolean} - SSH命令是否存在
 */
function checkSSHExecutable() {
  if (!commandExistsSync('ssh')) {
    logger.error('未找到SSH命令，请确保已安装SSH客户端');
    vscode.window.showErrorMessage('未找到SSH命令，请确保已安装SSH客户端');
    return false;
  }
  return true;
}

/**
 * 获取服务器列表
 * @returns {Array} - 服务器列表
 */
function getServerList() {
  return configLoader.getServerList();
}

/**
 * 根据文件路径查找服务器
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器配置，如果未找到则返回null
 */
function findServerForPath(filePath) {
  return pathConverter.findServerForPath(filePath);
}

module.exports = {
  openTerminal,
  connectToServer,
  checkSSHExecutable,
  getServerList,
  findServerForPath,
};
