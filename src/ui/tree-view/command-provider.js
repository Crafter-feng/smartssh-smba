/**
 * 命令树视图提供者模块
 * 为VS Code侧边栏提供命令树视图
 */

const vscode = require('vscode');
const configLoader = require('../../adapters/config-loader');
const { logger } = require('../../utils/logger');
const BaseTreeItem = require('./base-tree-item');

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
    this.command = command;
    this.contextValue = contextValue;

    // 设置命令相关属性
    this.setupCommandItem();
  }

  /**
   * 设置命令项的属性
   */
  setupCommandItem() {
    // 设置图标
    if (this.command && this.command.icon) {
      this.iconPath = new vscode.ThemeIcon(this.command.icon);
    } else {
      this.iconPath = new vscode.ThemeIcon('terminal');
    }

    // 设置工具提示
    if (this.command) {
      this.tooltip = this.command.description || this.command.command || this.label;
    } else {
      this.tooltip = this.label;
    }

    // 设置描述
    if (this.command && this.command.description) {
      this.description = this.command.description;
    }

    // 设置点击命令
    if (this.contextValue !== 'command-group') {
      this.command = {
        command: 'smartssh-smba.sendCommand',
        title: '发送命令',
        arguments: [this]
      };
    }
  }
}

/**
 * 命令树视图提供者
 */
class CommandTreeProvider {
  /**
   * 创建命令树视图提供者
   */
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
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
        return this.getRootNodes();
      } else if (element.contextValue === 'command-group') {
        // 返回命令组的子节点
        return this.getCommandNodes(element.command.commands, element.command.type);
      }
      
      return [];
    } catch (error) {
      logger.error(`获取命令树节点时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取根节点
   * @returns {CommandTreeItem[]} - 树项数组
   */
  getRootNodes() {
    try {
      // 获取配置
      const config = configLoader.getConfig();
      if (!config) {
        return [];
      }
      
      const nodes = [];
      
      // 添加全局命令组
      if (config.customCommands && config.customCommands.length > 0) {
        nodes.push(
          new CommandTreeItem(
            '全局命令',
            vscode.TreeItemCollapsibleState.Collapsed,
            { type: 'global', commands: config.customCommands },
            'command-group'
          )
        );
      }
      
      // 添加工作区命令组
      const workspaceCommands = configLoader.getWorkspaceCommands();
      if (workspaceCommands && workspaceCommands.length > 0) {
        nodes.push(
          new CommandTreeItem(
            '工作区命令',
            vscode.TreeItemCollapsibleState.Collapsed,
            { type: 'workspace', commands: workspaceCommands },
            'command-group'
          )
        );
      }
      
      // 如果没有命令，返回提示
      if (nodes.length === 0) {
        return [
          new CommandTreeItem(
            '点击添加命令...',
            vscode.TreeItemCollapsibleState.None,
            { command: 'smartssh-smba.addCommand', description: '添加新命令' },
            'no-command'
          )
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

module.exports = {
  CommandTreeProvider,
  CommandTreeItem
}; 