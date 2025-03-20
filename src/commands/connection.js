/**
 * SSH连接命令模块
 * 处理所有与SSH连接相关的命令
 */

const vscode = require('vscode');
const sshService = require('../services/ssh-service');
const { logger } = require('../utils/logger');

/**
 * 打开SSH连接
 * @param {string} serverName - 服务器名称
 * @param {boolean} force - 是否强制创建新终端
 */
async function openSSHConnection(serverName, force = false) {
  try {
    // 连接到服务器
    await sshService.connectToServer(serverName, force);
  } catch (error) {
    logger.error(`打开SSH连接时出错: ${error.message}`);
    vscode.window.showErrorMessage(`打开SSH连接时出错: ${error.message}`);
  }
}

/**
 * 快速打开SSH连接
 */
async function fastOpenConnection() {
  try {
    // 获取当前活跃的编辑器
    const editor = vscode.window.activeTextEditor;
    let serverName = null;
    
    if (editor) {
      // 获取当前文件的路径
      const filePath = editor.document.uri.fsPath;
      if (filePath) {
        // 根据文件路径查找对应的服务器
        const server = sshService.findServerForPath(filePath);
        if (server) {
          serverName = server.name;
        }
      }
    }
    
    if (serverName) {
      // 如果找到对应的服务器，直接连接
      await openSSHConnection(serverName);
    } else {
      // 否则让用户选择服务器
      serverName = await selectServer();
      if (serverName) {
        await openSSHConnection(serverName);
      }
    }
  } catch (error) {
    logger.error(`快速打开SSH连接时出错: ${error.message}`);
    vscode.window.showErrorMessage(`快速打开SSH连接时出错: ${error.message}`);
  }
}

/**
 * 选择服务器
 * @returns {Promise<string|null>} 服务器名称，如果用户取消则返回null
 */
async function selectServer() {
  try {
    // 获取服务器列表
    const serverList = sshService.getServerList();
    
    if (!serverList || serverList.length === 0) {
      vscode.window.showInformationMessage('没有配置服务器，请先添加服务器');
      return null;
    }
    
    // 创建选择项
    const items = serverList.map(server => ({
      label: server.name,
      description: `${server.username}@${server.host}`,
      server
    }));
    
    // 显示快速选择
    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: '选择一个服务器'
    });
    
    return selection ? selection.label : null;
  } catch (error) {
    logger.error(`选择服务器时出错: ${error.message}`);
    return null;
  }
}

/**
 * 注册连接相关命令
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function register(context) {
  // 注册打开SSH连接命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.openConnection', async () => {
      const serverName = await selectServer();
      if (serverName) {
        await openSSHConnection(serverName);
      }
    })
  );
  
  // 注册快速打开连接命令
  context.subscriptions.push(
    vscode.commands.registerCommand('smartssh-smba.fastOpenConnection', fastOpenConnection)
  );
}

module.exports = {
  openSSHConnection,
  fastOpenConnection,
  selectServer,
  register
}; 