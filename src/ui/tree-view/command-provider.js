/**
 * 命令树视图提供者模块
 * 为VS Code侧边栏提供命令树视图
 */

const vscode = require('vscode');
const configLoader = require('../../adapters/config-loader');
const { logger } = require('../../utils/logger');
const BaseTreeItem = require('./base-tree-item');

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
    { pattern: ['grep', 'find', 'search'], icon: 'search' },
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
 * 命令树项
 */
class CommandTreeItem extends BaseTreeItem {
  /**
   * 创建命令树项
   * @param {string} label - 显示的标签
   * @param {vscode.TreeItemCollapsibleState} collapsibleState - 可折叠状态
   * @param {Object} command - 命令对象
   * @param {string} contextValue - 上下文值
   */
  constructor(label, collapsibleState, command, contextValue) {
    super(label, collapsibleState);
    this.commandObj = command; // 使用commandObj存储命令
    this.contextValue = contextValue;

    // 设置命令相关属性
    this.setupCommandItem();
  }

  /**
   * 设置命令项的属性
   */
  setupCommandItem() {
    // 设置图标
    if (this.commandObj && this.commandObj.icon) {
      this.iconPath = new vscode.ThemeIcon(this.commandObj.icon);
    } else {
      this.iconPath = getIconForItem(this.commandObj);
    }

    // 设置工具提示 - 与服务器列表的自定义命令保持一致
    if (this.commandObj) {
      this.tooltip = `执行命令: ${this.commandObj.command}`;
      if (this.commandObj.description) {
        this.tooltip += `\n${this.commandObj.description}`;
      }
    } else {
      this.tooltip = `执行命令: ${this.label}`;
    }

    // 设置描述
    if (this.commandObj && this.commandObj.description) {
      this.description = this.commandObj.description;
    }

    // 对于命令树项，command设置为null，让用户通过右键菜单执行命令
    // 这与ServerTreeItem保持一致
    this.command = null;
  }
}

/**
 * 命令树视图提供者
 */
class CommandTreeProvider {
  /**
   * 创建命令树视图提供者
   * @param {vscode.ExtensionContext} context - 扩展上下文
   */
  constructor(context) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.context = context;
  }

  /**
   * 刷新树视图
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * 获取树项
   * @param {CommandTreeItem} element - 树项元素
   * @returns {Promise<CommandTreeItem[]>} - 子树项数组
   */
  async getChildren(element) {
    try {
      if (!element) {
        // 返回根节点
        return await this.getRootNodes();
      } else if (element.contextValue === 'command-group') {
        // 返回命令组的子节点
        return this.getCommandNodes(element.commandObj.commands, element.commandObj.type);
      } else if (element.contextValue === 'workspace-commands-group') {
        // 返回工作区命令组的子节点
        return this.getCommandNodes(element.commandObj.commands, 'workspace');
      }

      return [];
    } catch (error) {
      logger.error(`获取命令树节点时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取根节点
   * @returns {Promise<CommandTreeItem[]>} - 树项数组
   */
  async getRootNodes() {
    try {
      // 获取配置
      const config = configLoader.getConfig();
      if (!config) {
        return [];
      }

      const nodes = [];

      // 获取全局命令 - 确保只显示非工作区命令
      const globalCommands = config.customCommands || [];

      // 将全局命令直接添加到根节点，不再使用分组
      if (globalCommands.length > 0) {
        // 为每个全局命令创建条目，直接添加到根节点
        globalCommands.forEach(cmd => {
          nodes.push(
            new CommandTreeItem(
              cmd.name || cmd.command,
              vscode.TreeItemCollapsibleState.None,
              cmd,
              'global-command'
            )
          );
        });
      }

      // 获取工作区命令
      const workspaceCommands = configLoader.getWorkspaceCommands();

      // 如果有工作区命令，添加工作区组
      if (workspaceCommands && workspaceCommands.length > 0) {
        const workspaceName = vscode.workspace.name || '当前工作区';
        const workspaceCommandsGroup = new CommandTreeItem(
          workspaceName,
          vscode.TreeItemCollapsibleState.Expanded,
          { type: 'workspace', commands: workspaceCommands },
          'workspace-commands-group'
        );
        nodes.push(workspaceCommandsGroup);
      }

      // 如果没有命令，返回提示
      if (nodes.length === 0) {
        return [
          new CommandTreeItem(
            '点击添加命令...',
            vscode.TreeItemCollapsibleState.None,
            { command: 'smartssh-smba.addCommand', description: '添加新命令' },
            'no-command'
          ),
        ];
      }

      return nodes;
    } catch (error) {
      logger.error(`获取命令根节点时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取命令节点
   * @param {Array} commands - 命令数组
   * @param {string} type - 命令类型（全局/工作区）
   * @returns {CommandTreeItem[]} - 树项数组
   */
  getCommandNodes(commands, type) {
    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return [];
    }

    return commands.map(cmd => {
      // 确定上下文值
      let contextValue = 'command';
      if (type === 'global') {
        contextValue = 'global-command';
      } else if (type === 'workspace') {
        contextValue = 'workspace-command';
      }

      return new CommandTreeItem(
        cmd.name || cmd.command,
        vscode.TreeItemCollapsibleState.None,
        cmd,
        contextValue
      );
    });
  }

  /**
   * 获取树项
   * @param {CommandTreeItem} element - 树项元素
   * @returns {CommandTreeItem} - 树项
   */
  getTreeItem(element) {
    return element;
  }
}

// 导出
module.exports = {
  CommandTreeProvider,
  getIconForItem,
};
