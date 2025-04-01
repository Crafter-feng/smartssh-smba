const vscode = require('vscode');
const path = require('path');
const { logger } = require('../utils/logger');
const pathUtils = require('../utils/path-utils');
const fileService = require('../services/file-service');
const terminalManager = require('../services/terminal-manager');
const configLoader = require('../adapters/config-loader');

/**
 * 注册终端链接处理器
 * @param {vscode.ExtensionContext} context 扩展上下文
 */
function registerTerminalLinkProvider(context) {
  const termLinkProvider = vscode.window.registerTerminalLinkProvider({
    provideTerminalLinks: (context, token) => {
      const links = [];

      // 获取当前活动终端对应的服务器
      const activeTerminal = vscode.window.activeTerminal
        ? terminalManager.findTerminalByVscodeTerminal(vscode.window.activeTerminal)
        : null;
      if (!activeTerminal) {
        return links;
      }

      // 获取活动终端对应的服务器
      const activeSSHTerminal = terminalManager.getActiveSSHTerminal();
      if (!activeSSHTerminal || !activeSSHTerminal.metadata || !activeSSHTerminal.metadata.serverInfo) {
        return links;
      }

      const activeServer = activeSSHTerminal.metadata.serverInfo;
      if (!activeServer && !activeServer.pathMappings && !activeServer.pathMappings.length) {
        return links;
      }

      // 在文本中查找所有可能的路径
      const potentialPaths = pathUtils.findPotentialPaths(context.line);

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
            serverName: activeServer.name,
            isRelative: pathInfo.isRelative,
            workspaceRoot: pathInfo.workspaceRoot,
          },
        });
      }

      return links;
    },
    handleTerminalLink: async link => {
      const { filePath, line, column, serverName } = link.data;
      try {
        // 获取服务器信息
        let server = null;
        
        // 方法1: 根据服务器名获取相关终端
        if (serverName) {
          // 查找与该服务器相关的终端
          const serverTerminals = terminalManager.findTerminalsByServerName(serverName);
          if (serverTerminals && serverTerminals.length > 0 && serverTerminals[0].metadata) {
            server = serverTerminals[0].metadata.serverInfo;
            logger.debug(`通过服务器名称 ${serverName} 找到服务器配置`);
          }
        }
        
        // 方法2: 从当前活动终端获取服务器
        if (!server) {
          const activeSSHTerminal = terminalManager.getActiveSSHTerminal();
          if (activeSSHTerminal && activeSSHTerminal.metadata && activeSSHTerminal.metadata.serverInfo) {
            server = activeSSHTerminal.metadata.serverInfo;
            logger.debug(`从活动终端找到服务器: ${server.name}`);
          }
        }
        
        // 方法3: 从所有SSH终端中获取第一个有效的服务器
        if (!server) {
          const allSSHTerminals = terminalManager.getAllSSHTerminals();
          if (allSSHTerminals && allSSHTerminals.length > 0) {
            for (const sshTerminal of allSSHTerminals) {
              if (sshTerminal.metadata && sshTerminal.metadata.serverInfo) {
                server = sshTerminal.metadata.serverInfo;
                logger.debug(`从SSH终端列表找到服务器: ${server.name}`);
                break;
              }
            }
          }
        }
        
        // 方法4: 从配置加载器直接获取
        if (!server) {
          const configServers = configLoader.getServerList();
          if (configServers && configServers.length > 0) {
            server = configServers[0];
            logger.debug(`从配置加载器找到服务器: ${server.name}`);
          }
        }

        if (!server) {
          logger.warn('没有活动的服务器连接');
          // 如果没找到服务器，直接通过文件名搜索
          const fileName = filePath ? filePath.split(/[/\\]/).pop() : null;
          if (fileName) {
            await fileService.searchAndOpenFile(fileName, line, column);
          }
          return;
        }

        // 记录服务器信息以便调试
        logger.debug(`处理路径 ${filePath}，使用服务器: ${server.name}`);
        
        // 使用新的openPathFromText函数处理路径并打开文件
        const result = await pathUtils.openPathFromText(filePath, server);
        
        // 确保result对象存在，再检查其属性
        if (!result) {
          logger.error('openPathFromText返回了undefined或null');
          // 如果处理失败，尝试使用文件名搜索
          const fileName = filePath ? filePath.split(/[/\\]/).pop() : null;
          if (fileName) {
            await fileService.searchAndOpenFile(fileName, line, column);
          }
          return;
        }
        
        if (!result.success) {
          logger.warn(`无法打开路径: ${filePath}, 原因: ${result.reason || result.error}`);
          
          // 如果处理失败，尝试使用文件名搜索
          const fileName = filePath ? filePath.split(/[/\\]/).pop() : null;
          if (fileName) {
            await fileService.searchAndOpenFile(fileName, line, column);
          }
        } else {
          logger.info(`成功处理路径: ${filePath}, 操作: ${result.action}`);
        }
      } catch (error) {
        logger.error(`处理终端链接时出错: ${error.message}`);
        const fileName = filePath ? filePath.split(/[/\\]/).pop() : null;
        if (fileName) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
        }
      }
    },
  });

  context.subscriptions.push(termLinkProvider);
}

/**
 * 注册基本的文件点击处理命令
 * @param {vscode.ExtensionContext} context 扩展上下文
 */
function registerFilePathClickCommand(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.handlePathClick', path => {
      fileService.openLocalFile(path);
    })
  );
}

/**
 * 注册映射文件打开命令
 * @param {vscode.ExtensionContext} context 扩展上下文
 */
function registerOpenMappedFileCommand(context) {
  const disposable = vscode.commands.registerCommand('smartssh-smba.openMappedFile',
    async (filePath, serverName, line, column) => {
      try {
        logger.info(`尝试打开映射文件: ${filePath}`);

        // 确定要使用的服务器
        let server = null;
        
        // 方法1: 根据服务器名获取相关终端
        if (serverName) {
          // 查找与该服务器相关的终端
          const serverTerminals = terminalManager.findTerminalsByServerName(serverName);
          if (serverTerminals && serverTerminals.length > 0 && serverTerminals[0].metadata) {
            server = serverTerminals[0].metadata.serverInfo;
            logger.debug(`通过服务器名称 ${serverName} 找到服务器配置`);
          }
        }
        
        // 方法2: 从当前活动终端获取服务器
        if (!server) {
          const activeSSHTerminal = terminalManager.getActiveSSHTerminal();
          if (activeSSHTerminal && activeSSHTerminal.metadata && activeSSHTerminal.metadata.serverInfo) {
            server = activeSSHTerminal.metadata.serverInfo;
            logger.debug(`从活动终端找到服务器: ${server.name}`);
          }
        }
        
        // 方法3: 从所有SSH终端中获取第一个有效的服务器
        if (!server) {
          const allSSHTerminals = terminalManager.getAllSSHTerminals();
          if (allSSHTerminals && allSSHTerminals.length > 0) {
            for (const sshTerminal of allSSHTerminals) {
              if (sshTerminal.metadata && sshTerminal.metadata.serverInfo) {
                server = sshTerminal.metadata.serverInfo;
                logger.debug(`从SSH终端列表找到服务器: ${server.name}`);
                break;
              }
            }
          }
        }
        
        // 方法4: 从配置加载器直接获取
        if (!server) {
          const configServers = configLoader.getServerList();
          if (configServers && configServers.length > 0) {
            server = configServers[0];
            logger.debug(`从配置加载器找到服务器: ${server.name}`);
          }
        }

        if (!server) {
          logger.warn('没有活动的服务器连接');
          // 即使没有服务器连接，也尝试通过文件名搜索
          const fileInfo = pathUtils.extractFileInfo(filePath);
          await fileService.searchAndOpenFile(fileInfo.fileName, line || fileInfo.line, column || fileInfo.column);
          return;
        }

        // 记录服务器信息以便调试
        logger.debug(`处理映射文件 ${filePath}，使用服务器: ${server.name}`);
        
        // 使用新的openPathFromText函数打开路径
        const result = await pathUtils.openPathFromText(filePath, server);
        
        // 确保result对象存在，再检查其属性
        if (!result) {
          logger.error('openPathFromText返回了undefined或null');
          // 如果处理失败，尝试使用文件名搜索
          const fileInfo = pathUtils.extractFileInfo(filePath);
          await fileService.searchAndOpenFile(fileInfo.fileName, line || fileInfo.line, column || fileInfo.column);
          return;
        }
        
        if (!result.success) {
          logger.warn(`无法打开映射文件: ${filePath}, 原因: ${result.reason || result.error}`);
          
          // 如果处理失败，尝试通过文件名搜索
          const fileInfo = pathUtils.extractFileInfo(filePath);
          await fileService.searchAndOpenFile(fileInfo.fileName, line || fileInfo.line, column || fileInfo.column);
        } else {
          logger.info(`成功处理映射文件: ${filePath}, 操作: ${result.action}`);
        }
      } catch (error) {
        logger.error(`打开映射文件时出错: ${error.message}`);
        vscode.window.showErrorMessage(`打开文件时出错: ${error.message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

/**
 * 注册所有文件路径点击处理功能
 * @param {vscode.ExtensionContext} context 扩展上下文
 */
function registerAll(context) {
  registerFilePathClickCommand(context);
  registerOpenMappedFileCommand(context);
  registerTerminalLinkProvider(context);
}

module.exports = {
  registerAll,
  registerFilePathClickCommand,
  registerOpenMappedFileCommand,
  registerTerminalLinkProvider,
};
