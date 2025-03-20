/**
 * 基础树项组件
 * 提供共享的树项功能
 */

const vscode = require('vscode');

/**
 * 获取适当的图标
 * @param {string|Object} item - 项目键名或命令
 * @returns {vscode.ThemeIcon} - 主题图标
 */
function getIconForItem(item) {
  // 统一的图标映射，使用模式匹配
  const iconPatterns = [
    { pattern: ['host', 'hostname', 'server'], icon: 'globe' },
    { pattern: ['username', 'user', 'account'], icon: 'person' },
    { pattern: ['port', 'socket'], icon: 'plug' },
    { pattern: ['password', 'pwd', 'secret'], icon: 'lock' },
    { pattern: ['privateKey', 'key', 'certificate'], icon: 'key' },
    { pattern: ['agent', 'proxy'], icon: 'shield' },
    { pattern: ['path'], icon: 'folder' },
    { pattern: ['localPath', 'local'], icon: 'folder-opened' },
    { pattern: ['remotePath', 'remote'], icon: 'remote' },
    { pattern: ['ls', 'dir', 'list'], icon: 'list-tree' },
    { pattern: ['cd', 'chdir'], icon: 'folder' },
    { pattern: ['git'], icon: 'git-branch' },
    { pattern: ['npm', 'yarn', 'pnpm'], icon: 'package' },
    { pattern: ['docker', 'container'], icon: 'server-environment' },
    { pattern: ['ssh', 'telnet'], icon: 'remote-explorer' },
    { pattern: ['cat', 'less', 'more', 'type'], icon: 'file-text' },
    { pattern: ['rm', 'del', 'delete', 'remove'], icon: 'trash' },
    { pattern: ['cp', 'copy'], icon: 'files' },
    { pattern: ['mv', 'move', 'rename'], icon: 'arrow-right' },
    { pattern: ['mkdir', 'md'], icon: 'new-folder' },
    { pattern: ['touch', 'new-item', 'ni'], icon: 'new-file' },
    { pattern: ['chmod', 'chown', 'permission'], icon: 'shield' },
    { pattern: ['ps', 'top', 'process'], icon: 'pulse' },
    { pattern: ['grep', 'find', 'search'], icon: 'search' }
  ];

  // 获取要匹配的文本
  let textToMatch = '';
  if (typeof item === 'string') {
    textToMatch = item;
  } else if (item && item.command) {
    textToMatch = item.command;
  } else {
    // 如果没有有效的文本，返回默认图标
    return new vscode.ThemeIcon('terminal');
  }

  // 转为小写以便不区分大小写匹配
  const lowerText = textToMatch.toLowerCase();

  // 查找匹配的图标
  for (const pattern of iconPatterns) {
    if (pattern.pattern.some(p => lowerText.includes(p.toLowerCase()))) {
      return new vscode.ThemeIcon(pattern.icon);
    }
  }

  // 默认图标
  return new vscode.ThemeIcon('terminal');
}

/**
 * 基础树项类 - 包含共享的功能
 */
class BaseTreeItem extends vscode.TreeItem {
  /**
   * 设置命令相关属性
   * @param {Object} commandObj - 命令对象
   * @param {string} contextValue - 上下文值
   * @param {boolean} enableClickAction - 是否启用点击动作
   */
  setupCommandProperties(commandObj, contextValue, enableClickAction = false) {
    // 设置图标
    if (commandObj && commandObj.icon) {
      this.iconPath = new vscode.ThemeIcon(commandObj.icon);
    } else {
      this.iconPath = getIconForItem(commandObj ? commandObj.command : this.label);
    }

    // 设置工具提示
    if (commandObj) {
      this.tooltip = `执行命令: ${commandObj.command}`;
      if (commandObj.description) {
        this.tooltip += `\n${commandObj.description}`;
      }
    } else {
      this.tooltip = `执行命令: ${this.label}`;
    }

    // 设置点击命令
    if (enableClickAction) {
      this.command = {
        command: 'smartssh-smba.sendCommand',
        title: '发送命令',
        arguments: [this]
      };
    } else {
      this.command = null;
    }
  }
}

module.exports = BaseTreeItem; 