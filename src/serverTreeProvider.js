/* eslint-disable @stylistic/no-trailing-spaces */
/* eslint-disable @stylistic/comma-dangle */
const vscode = require('vscode');
const configLoader = require('../adapters/config-loader');
const { logger } = require('../adapters/logger');

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

/**
 * 服务器树项
 */
class ServerTreeItem extends BaseTreeItem {
  /**
   * 创建服务器树项
   * @param {string} label - 显示的标签
   * @param {vscode.TreeItemCollapsibleState} collapsibleState - 可折叠状态
   * @param {Object} server - 服务器对象
   * @param {string} contextValue - 上下文值
   * @param {string} configKey - 配置键（可选）
   * @param {Object} commandObj - 命令对象（可选）
   */
  constructor(label, collapsibleState, server, contextValue, configKey = null, commandObj = null) {
    super(label, collapsibleState);
    this.server = server;
    this.contextValue = contextValue;
    this.configKey = configKey;
    this.commandObj = commandObj;

    // 根据不同的上下文值设置不同的属性
    switch (contextValue) {
      case 'server':
        this.setupServerItem();
        break;
      case 'command':
      case 'workspace-command':
      case 'global-command':
      case 'serverCommand':
      case 'init-command':
      case 'server-command':
        this.setupCommandProperties(commandObj, contextValue, false);
        break;
      case 'config':
        this.setupConfigItem();
        break;
      case 'config-group':
        this.iconPath = new vscode.ThemeIcon('settings');
        break;
      case 'init-commands-group':
      case 'custom-commands-group':
        this.iconPath = new vscode.ThemeIcon('terminal');
        break;
      case 'smb-group':
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        break;
      case 'global-commands-group':
        this.iconPath = new vscode.ThemeIcon('globe');
        break;
      case 'workspace-commands-group':
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'connected-servers-group':
        this.iconPath = new vscode.ThemeIcon('remote-explorer');
        break;
    }
  }

  /**
   * 设置服务器项的属性
   */
  setupServerItem() {
    this.iconPath = new vscode.ThemeIcon('server');
    this.description = `${this.server.configuration.username}@${this.server.configuration.host}`;
    this.tooltip = `${this.label}\n${this.server.configuration.username}@${this.server.configuration.host}`;
    this.command = null; // 不自动执行命令，使用右键菜单
  }

  /**
   * 设置配置项的属性
   */
  setupConfigItem() {
    // 根据配置类型设置图标
    this.iconPath = getIconForItem(this.configKey);

    // 根据配置类型设置描述和工具提示
    if (this.configKey === 'password' && this.server.configuration[this.configKey]) {
      this.description = '********';
    } else if (this.configKey === 'privateKey' && this.server.configuration[this.configKey]) {
      const keyPath = this.server.configuration[this.configKey];
      this.description = keyPath;
      this.tooltip = `私钥文件路径: ${keyPath}`;
    } else {
      this.description = this.server.configuration[this.configKey] !== undefined
        ? String(this.server.configuration[this.configKey])
        : '';
    }
  }
}

/**
 * 命令树项
 */
class CommandTreeItem extends BaseTreeItem {
  /**
   * 创建命令树项
   * @param {string} label - 显示的标签
   * @param {vscode.TreeItemCollapsibleState} collapsibleState - 可折叠状态
   * @param {Object} commandObj - 命令对象
   * @param {string} contextValue - 上下文值
   * @param {Object} server - 服务器对象（可选）
   */
  constructor(label, collapsibleState, commandObj, contextValue, server = null) {
    super(label, collapsibleState);

    this.commandObj = commandObj;
    this.contextValue = contextValue;
    this.server = server;

    // 设置命令相关属性
    this.setupCommandProperties(commandObj, contextValue, false);

    // 设置描述 - 根据需要可以设置为 null
    this.description = null;
  }
}

/**
 * 服务器树视图提供者
 */
class ServerTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.servers = [];
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // 根节点：显示服务器列表
      return this.getServerItems();
    } else if (element.contextValue === 'server') {
      // 服务器子节点：显示配置、命令等
      return this.getServerChildItems(element);
    } else if (element.contextValue === 'config-group') {
      // 配置组：显示配置项
      return this.getConfigItems(element);
    } else if (element.contextValue === 'init-commands-group' || element.contextValue === 'custom-commands-group') {
      // 命令组：显示命令
      return this.getCommandItems(element);
    } else if (element.contextValue === 'smb-group') {
      // SMB 组：显示 SMB 映射
      return this.getSmbItems(element);
    } else if (element.contextValue === 'connected-servers-group') {
      // 已连接服务器组：显示已连接的服务器
      return this.getConnectedServerItems();
    }

    return [];
  }

  /**
   * 获取服务器项列表
   * @returns {Array} - 服务器项列表
   */
  getServerItems() {
    if (!this.servers || this.servers.length === 0) {
      // 如果没有服务器，显示提示
      const noServersItem = new vscode.TreeItem('没有配置服务器', vscode.TreeItemCollapsibleState.None);
      noServersItem.contextValue = 'no-servers';
      return [noServersItem];
    }

    // 创建服务器树项
    return this.servers.map(server => {
      return new ServerTreeItem(
        server.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        server,
        'server'
      );
    });
  }

  /**
   * 获取服务器子项列表
   * @param {Object} element - 服务器元素
   * @returns {Array} - 服务器子项列表
   */
  getServerChildItems(element) {
    const server = element.server;
    const items = [];

    // 添加配置组
    const configGroup = this.createGroupItem('配置', 'config-group', 'settings', server);
    items.push(configGroup);

    // 添加初始化命令组
    if (server.configuration.initCommands && server.configuration.initCommands.length > 0) {
      const initCommandsGroup = this.createGroupItem('初始化命令', 'init-commands-group', 'terminal', server);
      items.push(initCommandsGroup);
    }

    // 添加自定义命令组
    if (server.configuration.customCommands && server.configuration.customCommands.length > 0) {
      const customCommandsGroup = this.createGroupItem('自定义命令', 'custom-commands-group', 'terminal', server);
      items.push(customCommandsGroup);
    }

    // 添加 SMB 映射组 - 只检查 smbMappingList
    if (server.configuration.smbMappingList && server.configuration.smbMappingList.length > 0) {
      const smbGroup = this.createGroupItem('SMB 映射', 'smb-group', 'folder-opened', server);
      items.push(smbGroup);
    }

    return items;
  }

  /**
   * 创建分组项
   * @param {string} label - 标签
   * @param {string} contextValue - 上下文值
   * @param {string} iconName - 图标名称
   * @param {Object} server - 服务器对象
   * @returns {vscode.TreeItem} - 树项
   */
  createGroupItem(label, contextValue, iconName, server) {
    const groupItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    groupItem.iconPath = new vscode.ThemeIcon(iconName);
    groupItem.contextValue = contextValue;
    groupItem.server = server;
    return groupItem;
  }

  /**
   * 获取配置项列表
   * @param {Object} element - 配置组元素
   * @returns {Array} - 配置项列表
   */
  getConfigItems(element) {
    const server = element.server;

    // 添加主要配置项
    const configItems = [
      { key: 'host', label: '主机', value: server.configuration.host },
      { key: 'username', label: '用户名', value: server.configuration.username },
      { key: 'port', label: '端口', value: server.configuration.port || 22 },
    ];

    // 添加其他配置项
    if (server.configuration.privateKey) {
      configItems.push({ key: 'privateKey', label: '私钥', value: server.configuration.privateKey });
    }

    if (server.configuration.agent) {
      configItems.push({ key: 'agent', label: '代理', value: '启用' });
    }

    // 创建配置项树项
    return configItems.map(item => {
      const treeItem = new vscode.TreeItem(`${item.label}: ${item.value}`, vscode.TreeItemCollapsibleState.None);
      treeItem.iconPath = getIconForItem(item.key);
      treeItem.contextValue = 'config-item';
      return treeItem;
    });
  }

  /**
   * 获取命令项列表
   * @param {Object} element - 命令组元素
   * @returns {Array} - 命令项列表
   */
  getCommandItems(element) {
    const server = element.server;
    const commands = element.contextValue === 'init-commands-group'
      ? server.configuration.initCommands
      : server.configuration.customCommands;

    return commands.map(cmd => {
      // 处理命令对象或字符串
      const isObject = typeof cmd === 'object' && cmd !== null;
      const commandName = isObject ? cmd.name : cmd;

      // 设置上下文值
      const contextValue = element.contextValue === 'init-commands-group'
        ? 'init-command'
        : 'server-command';

      // 创建命令对象
      const commandObj = isObject
        ? { ...cmd, contextValue }
        : { command: cmd, contextValue };

      // 使用 CommandTreeItem 创建命令项
      const treeItem = new CommandTreeItem(
        commandName,
        vscode.TreeItemCollapsibleState.None,
        commandObj,
        contextValue,
        server
      );

      // 对于初始化命令和服务器命令，我们不希望点击时自动执行
      // 而是显示右键菜单
      treeItem.command = null;

      return treeItem;
    });
  }

  /**
   * 获取 SMB 项列表
   * @param {Object} element - SMB 组元素
   * @returns {Array} - SMB 项列表
   */
  getSmbItems(element) {
    const server = element.server;
    const items = [];

    // 只处理 smbMappingList 配置
    if (server.configuration.smbMappingList && server.configuration.smbMappingList.length > 0) {
      server.configuration.smbMappingList.forEach((mapping, index) => {
        if (mapping.localPath || mapping.remotePath) {
          const mappingItem = new vscode.TreeItem(`映射 ${index + 1}`, vscode.TreeItemCollapsibleState.Expanded);
          mappingItem.contextValue = 'smb-mapping';
          mappingItem.iconPath = new vscode.ThemeIcon('link');
          items.push(mappingItem);

          if (mapping.localPath) {
            const localPathItem = new vscode.TreeItem(`本地路径: ${mapping.localPath}`, vscode.TreeItemCollapsibleState.None);
            localPathItem.iconPath = new vscode.ThemeIcon('folder-opened');
            localPathItem.contextValue = 'smb-local-path';
            items.push(localPathItem);
          }

          if (mapping.remotePath) {
            const remotePathItem = new vscode.TreeItem(`远程路径: ${mapping.remotePath}`, vscode.TreeItemCollapsibleState.None);
            remotePathItem.iconPath = new vscode.ThemeIcon('remote');
            remotePathItem.contextValue = 'smb-remote-path';
            items.push(remotePathItem);
          }
        }
      });
    }

    // 如果没有任何有效的映射配置，显示提示信息
    if (items.length === 0) {
      const noMappingItem = new vscode.TreeItem('没有配置 SMB 映射', vscode.TreeItemCollapsibleState.None);
      noMappingItem.contextValue = 'no-smb-mapping';
      items.push(noMappingItem);
    }

    return items;
  }

  /**
   * 获取已连接服务器项列表
   * @returns {Array} - 已连接服务器项列表
   */
  getConnectedServerItems() {
    // 获取全局终端列表
    const terminals = global.terminals || [];

    if (terminals.length === 0) {
      const noTerminalsItem = new vscode.TreeItem('没有活动的 SSH 连接', vscode.TreeItemCollapsibleState.None);
      noTerminalsItem.contextValue = 'no-terminals';
      return [noTerminalsItem];
    }

    return terminals.map(terminal => {
      const label = terminal.name;
      const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      treeItem.description = `${terminal.username}@${terminal.host}`;
      treeItem.contextValue = 'connected-server';
      treeItem.iconPath = new vscode.ThemeIcon('vm-active');
      treeItem.terminal = terminal.terminal;

      // 设置点击命令
      treeItem.command = {
        command: 'smartssh-smba.showTerminal',
        title: '显示终端',
        arguments: [terminal.name]
      };

      return treeItem;
    });
  }
}

/**
 * 命令树视图提供者
 */
class CommandTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // 根节点：显示全局命令和工作区组
      return this.getRootItems();
    } else if (element.contextValue === 'workspace-commands-group') {
      // 工作区命令
      return this.getWorkspaceCommandItems();
    }

    return [];
  }

  /**
   * 获取根节点项列表
   * @returns {Array} - 根节点项列表
   */
  getRootItems() {
    const items = [];

    // 获取配置数据
    const configData = configLoader.loadConfig();

    // 获取全局命令 - 确保只显示非工作区命令
    const globalCommands = configData.customCommands.filter(cmd => cmd.contextValue !== 'workspace-command') || [];

    // 将全局命令直接添加到根节点
    items.push(...this.createCommandItems(globalCommands, 'global-command'));

    // 获取工作区命令
    const workspaceCommands = configData.workspaceCommands || [];

    // 如果有工作区命令，添加工作区组
    if (workspaceCommands.length > 0) {
      const workspaceName = vscode.workspace.name || '当前工作区';
      const workspaceCommandsGroup = new vscode.TreeItem(
        workspaceName,
        vscode.TreeItemCollapsibleState.Expanded
      );
      workspaceCommandsGroup.contextValue = 'workspace-commands-group';
      workspaceCommandsGroup.iconPath = new vscode.ThemeIcon('folder');
      items.push(workspaceCommandsGroup);
    }

    return items;
  }

  /**
   * 获取工作区命令项列表
   * @returns {Array} - 工作区命令项列表
   */
  getWorkspaceCommandItems() {
    const configData = configLoader.loadConfig();
    const workspaceCommands = configData.workspaceCommands || [];
    return this.createCommandItems(workspaceCommands, 'workspace-command');
  }

  /**
   * 创建命令项列表
   * @param {Array} commands - 命令数组
   * @param {string} contextValue - 上下文值
   * @param {Object} server - 服务器对象（可选）
   * @returns {Array} - 命令项列表
   */
  createCommandItems(commands, contextValue, server = null) {
    // 确保命令是数组
    if (!Array.isArray(commands)) {
      return [];
    }

    return commands.map(cmdObj => {
      // 处理命令对象或字符串
      const isObject = typeof cmdObj === 'object' && cmdObj !== null;
      const commandName = isObject ? cmdObj.name : cmdObj;

      // 创建命令树项
      return new CommandTreeItem(
        commandName,
        vscode.TreeItemCollapsibleState.None,
        isObject ? { ...cmdObj, contextValue } : { command: cmdObj, contextValue },
        contextValue,
        server
      );
    });
  }
}

module.exports = {
  ServerTreeProvider,
  CommandTreeProvider,
};
