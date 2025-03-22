/**
 * 状态栏模块
 * 管理VS Code状态栏上的扩展按钮
 */

const vscode = require('vscode');
const { logger } = require('../utils/logger');

// 状态栏按钮
let fastOpenConnectionButton = null;

/**
 * 初始化状态栏
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function initialize(context) {
  try {
    // 创建状态栏按钮
    fastOpenConnectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    fastOpenConnectionButton.command = 'smartssh-smba.fastOpenConnection';
    fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
    fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    fastOpenConnectionButton.show();

    // 将状态栏按钮添加到上下文处置列表
    context.subscriptions.push(fastOpenConnectionButton);

    // 记录日志
    logger.debug('状态栏已初始化');

    // 更新状态栏按钮
    updateStatusBarButton();
  } catch (error) {
    logger.error(`初始化状态栏时出错: ${error.message}`);
  }
}

/**
 * 更新状态栏按钮
 * 根据不同状态调整按钮显示
 */
function updateStatusBarButton() {
  try {
    if (!fastOpenConnectionButton) {
      return;
    }

    // 获取当前活动的编辑器
    const editor = vscode.window.activeTextEditor;

    if (editor) {
      // 根据编辑器状态调整按钮文本
      const filePath = editor.document.uri.fsPath;

      if (filePath) {
        // 检查文件路径是否为本地路径
        if (filePath.startsWith('file:')) {
          fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
          fastOpenConnectionButton.tooltip = '打开 SSH 连接';
        } else {
          // 对于远程文件
          fastOpenConnectionButton.text = '$(terminal) SSH 已连接';
          fastOpenConnectionButton.tooltip = '已连接到远程服务器';
        }
      } else {
        // 无文件路径
        fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
        fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      }
    } else {
      // 无活动编辑器
      fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    }

    // 显示按钮
    fastOpenConnectionButton.show();
  } catch (error) {
    logger.error(`更新状态栏按钮时出错: ${error.message}`);
    // 发生错误时设置为默认文本
    if (fastOpenConnectionButton) {
      fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
    }
  }
}

module.exports = {
  initialize,
  updateStatusBarButton,
};
