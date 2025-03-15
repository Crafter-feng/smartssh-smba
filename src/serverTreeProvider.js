const vscode = require('vscode');
const path = require('path');
const localCommandsLoader = require('../adapters/local-commands-loader');
const configLoader = require('../adapters/config-loader');

class ServerTreeItem extends vscode.TreeItem {
  constructor(label, collapsibleState, server, contextValue, configKey = null, commandObj = null) {
    super(label, collapsibleState);
    this.server = server;
    this.contextValue = contextValue;
    this.configKey = configKey;
    this.commandObj = commandObj;

    if (contextValue === 'server') {
      this.iconPath = new vscode.ThemeIcon('server');
      this.description = `${server.configuration.username}@${server.configuration.host}`;
      this.tooltip = `${label}\n${server.configuration.username}@${server.configuration.host}`;
      this.command = {
        command: 'smartssh-smba.connectToServer',
        title: '连接到服务器',
        arguments: [label],
      };
    } else if (contextValue === 'command' || contextValue === 'local-command' || contextValue === 'global-command' || contextValue === 'serverCommand') {
      // 统一处理所有命令类型
      this.setupCommandItem(contextValue);
    } else if (contextValue === 'config') {
      // 配置项显示，根据不同配置类型使用不同图标
      this.iconPath = getIconForConfig(configKey);

      // 如果是密码，显示星号
      if (configKey === 'password' && server.configuration[configKey]) {
        this.description = '********';
      } else if (configKey === 'privateKey' && server.configuration[configKey]) {
        // 显示密钥路径，但只显示文件名部分
        const keyPath = server.configuration[configKey];
        this.description = keyPath;
        this.tooltip = `私钥文件路径: ${keyPath}`;
      } else {
        this.description = server.configuration[configKey] !== undefined
          ? String(server.configuration[configKey])
          : '';
      }
    } else if (contextValue === 'config-group') {
      this.iconPath = new vscode.ThemeIcon('settings');
    } else if (contextValue === 'init-commands-group' || contextValue === 'custom-commands-group') {
      this.iconPath = new vscode.ThemeIcon('terminal');
    } else if (contextValue === 'smb-group') {
      this.iconPath = new vscode.ThemeIcon('folder-opened');
    } else if (contextValue === 'global-commands-group') {
      this.iconPath = new vscode.ThemeIcon('globe');
    } else if (contextValue === 'local-commands-group') {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else if (contextValue === 'connected-servers-group') {
      this.iconPath = new vscode.ThemeIcon('remote-explorer');
    }
  }

  /**
   * 设置命令项的属性
   * @param {string} contextValue - 上下文值
   */
  setupCommandItem(contextValue) {
    // 为命令分配图标
    if (this.commandObj && this.commandObj.icon) {
      // 如果命令对象中已有图标，使用它
      this.iconPath = new vscode.ThemeIcon(this.commandObj.icon);
    } else {
      // 否则使用默认图标或根据命令内容选择图标
      const cmdText = this.commandObj ? this.commandObj.command : this.label;
      this.iconPath = getIconForCommand(cmdText);
    }

    // 如果是自定义命令对象（带有name和command）
    if (this.commandObj) {
      // 添加工作区信息到描述（仅对本地命令）
      if (contextValue === 'local-command' && this.commandObj.workspaceFolder) {
        this.description = this.commandObj.workspaceFolder;
      } else if (this.commandObj.description) {
        // 如果有描述，显示在描述字段中
        this.description = this.commandObj.description;
      }

      this.tooltip = `执行命令: ${this.commandObj.command}`;
      if (this.commandObj.description) {
        this.tooltip += `\n${this.commandObj.description}`;
      }

      // 移除点击命令时的自动执行
      this.command = undefined;

      // 如果是全局命令或本地命令（没有服务器），设置特殊的 contextValue 以便显示删除按钮
      if (!this.server) {
        this.contextValue = contextValue;
      }
    } else {
      // 如果是简单的命令字符串
      this.tooltip = `执行命令: ${this.label}`;

      // 移除点击命令时的自动执行
      this.command = undefined;
    }
  }
}

/**
 * 根据配置类型获取适当的图标
 * @param {string} configKey - 配置键名
 * @returns {vscode.ThemeIcon} - 主题图标
 */
function getIconForConfig(configKey) {
  switch (configKey) {
    case 'host':
      return new vscode.ThemeIcon('globe');
    case 'username':
      return new vscode.ThemeIcon('person');
    case 'port':
      return new vscode.ThemeIcon('plug');
    case 'password':
      return new vscode.ThemeIcon('lock');
    case 'privateKey':
      return new vscode.ThemeIcon('key');
    case 'agent':
      return new vscode.ThemeIcon('shield');
    case 'path':
      return new vscode.ThemeIcon('folder');
    case 'localPath':
      return new vscode.ThemeIcon('folder-opened');
    case 'remotePath':
      return new vscode.ThemeIcon('remote');
    default:
      return new vscode.ThemeIcon('settings-gear');
  }
}

/**
 * 根据命令内容获取适当的图标
 * @param {string} command - 命令文本
 * @returns {vscode.ThemeIcon} - 主题图标
 */
function getIconForCommand(command) {
  if (!command) {
    // 如果命令为空，返回默认图标
    return new vscode.ThemeIcon('terminal-bash');
  }

  const commandLower = command.toLowerCase();

  // 根据命令内容选择图标
  if (commandLower.includes('git')) {
    return new vscode.ThemeIcon('git-branch');
  } else if (commandLower.includes('docker')) {
    return new vscode.ThemeIcon('package');
  } else if (commandLower.includes('npm') || commandLower.includes('node')) {
    return new vscode.ThemeIcon('nodejs');
  } else if (commandLower.includes('python') || commandLower.includes('pip')) {
    return new vscode.ThemeIcon('symbol-namespace');
  } else if (commandLower.includes('ls') || commandLower.includes('dir')) {
    return new vscode.ThemeIcon('list-tree');
  } else if (commandLower.includes('cd')) {
    return new vscode.ThemeIcon('folder');
  } else if (commandLower.includes('rm') || commandLower.includes('del')) {
    return new vscode.ThemeIcon('trash');
  } else if (commandLower.includes('cp') || commandLower.includes('copy')) {
    return new vscode.ThemeIcon('files');
  } else if (commandLower.includes('ssh')) {
    return new vscode.ThemeIcon('remote-explorer');
  } else if (commandLower.includes('sudo')) {
    return new vscode.ThemeIcon('shield');
  } else if (commandLower.includes('vim') || commandLower.includes('nano') || commandLower.includes('edit')) {
    return new vscode.ThemeIcon('edit');
  } else {
    // 如果没有匹配的图标，随机选择一个图标
    const randomIcons = [
      'terminal-bash', 'terminal', 'terminal-cmd', 'terminal-debian',
      'terminal-linux', 'terminal-powershell', 'terminal-tmux',
      'terminal-ubuntu', 'code', 'run', 'play', 'debug-console',
      'settings-gear', 'tools', 'extensions', 'pulse',
    ];

    // 使用命令字符串的长度作为伪随机种子，确保相同命令总是获得相同的图标
    const randomIndex = command.length % randomIcons.length;
    return new vscode.ThemeIcon(randomIcons[randomIndex]);
  }
}

/**
 * 服务器树视图提供者
 */
class ServerTreeProvider {
  constructor(servers) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.servers = servers || [];
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // 根节点：显示所有服务器
      return this.servers.map(server => {
        // 将状态设为 Collapsed，使服务器项可展开
        const treeItem = new vscode.TreeItem(server.name, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.tooltip = `${server.configuration.username}@${server.configuration.host}\n\n点击展开服务器详情\n使用右侧按钮连接到服务器`;
        treeItem.description = `${server.configuration.username}@${server.configuration.host}`;
        treeItem.contextValue = 'server';

        // 存储服务器信息，以便在展开时使用
        treeItem.server = server;

        // 移除命令，让单击操作默认展开/折叠树项
        treeItem.command = undefined;

        treeItem.iconPath = new vscode.ThemeIcon('server');

        return treeItem;
      });
    } else if (element.contextValue === 'server') {
      // 服务器节点，返回配置项和自定义命令
      const server = element.server;
      const items = [];

      // 配置项组 - 设置为自动展开
      const configGroup = new vscode.TreeItem('配置信息', vscode.TreeItemCollapsibleState.Expanded);
      configGroup.iconPath = new vscode.ThemeIcon('gear');
      configGroup.contextValue = 'config-group';
      configGroup.server = server;
      items.push(configGroup);

      // 初始化命令组 - 设置为自动展开
      if (server.configuration.initCommands && server.configuration.initCommands.length > 0) {
        const initCommandsGroup = new vscode.TreeItem('初始化命令', vscode.TreeItemCollapsibleState.Expanded);
        initCommandsGroup.iconPath = new vscode.ThemeIcon('terminal');
        initCommandsGroup.contextValue = 'init-commands-group';
        initCommandsGroup.server = server;
        items.push(initCommandsGroup);
      }

      // 自定义命令组 - 设置为自动展开
      if (server.configuration.customCommands && server.configuration.customCommands.length > 0) {
        const customCommandsGroup = new vscode.TreeItem('自定义命令', vscode.TreeItemCollapsibleState.Expanded);
        customCommandsGroup.iconPath = new vscode.ThemeIcon('terminal');
        customCommandsGroup.contextValue = 'custom-commands-group';
        customCommandsGroup.server = server;
        items.push(customCommandsGroup);
      }

      // SMB 映射组 - 设置为自动展开
      if (server.configuration.smbMapping) {
        const smbGroup = new vscode.TreeItem('SMB 映射', vscode.TreeItemCollapsibleState.Expanded);
        smbGroup.iconPath = new vscode.ThemeIcon('folder-opened');
        smbGroup.contextValue = 'smb-group';
        smbGroup.server = server;
        items.push(smbGroup);
      }

      return items;
    } else if (element.contextValue === 'config-group') {
      // 配置项组，返回所有配置项
      const server = element.server;

      // 添加主要配置项
      const configItems = [
        { key: 'host', label: '主机', value: server.configuration.host },
        { key: 'username', label: '用户名', value: server.configuration.username },
        { key: 'port', label: '端口', value: server.configuration.port || 22 }
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
        treeItem.iconPath = getIconForConfig(item.key);
        treeItem.contextValue = 'config-item';
        return treeItem;
      });
    } else if (element.contextValue === 'init-commands-group' || element.contextValue === 'custom-commands-group') {
      // 命令组，返回所有命令
      const server = element.server;
      const commands = element.contextValue === 'init-commands-group'
        ? server.configuration.initCommands
        : server.configuration.customCommands;

      return commands.map(cmd => {
        const treeItem = new vscode.TreeItem(cmd, vscode.TreeItemCollapsibleState.None);
        treeItem.iconPath = getIconForCommand(cmd);
        treeItem.contextValue = 'serverCommand';

        // 存储命令和服务器信息，以便发送命令时使用
        treeItem.command = undefined; // 点击命令项不执行任何命令
        treeItem.commandObj = {
          command: cmd
        };
        treeItem.server = server;

        return treeItem;
      });
    } else if (element.contextValue === 'smb-group') {
      // SMB 映射组，返回本地路径和远程路径
      const server = element.server;
      const smbMapping = server.configuration.smbMapping;
      const items = [];

      if (smbMapping.localPath) {
        const localPathItem = new vscode.TreeItem(`本地路径: ${smbMapping.localPath}`, vscode.TreeItemCollapsibleState.None);
        localPathItem.iconPath = new vscode.ThemeIcon('folder-opened');
        localPathItem.contextValue = 'smb-local-path';
        items.push(localPathItem);
      }

      if (smbMapping.remotePath) {
        const remotePathItem = new vscode.TreeItem(`远程路径: ${smbMapping.remotePath}`, vscode.TreeItemCollapsibleState.None);
        remotePathItem.iconPath = new vscode.ThemeIcon('remote');
        remotePathItem.contextValue = 'smb-remote-path';
        items.push(remotePathItem);
      }

      return items;
    }

    return [];
  }
}

class CommandTreeProvider {
  constructor(servers) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.servers = servers;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    if (element) {
      return element;
    }

    // 如果是根元素，返回标题
    const rootItem = new vscode.TreeItem('扩展命令', vscode.TreeItemCollapsibleState.Expanded);
    rootItem.tooltip = '全局扩展命令列表';
    return rootItem;
  }

  getChildren(element) {
    if (!element) {
      // 根节点：只显示全局命令和本地命令
      const items = [];

      // 添加全局命令组 - 确保设置正确的 contextValue
      const globalCommandsGroup = new vscode.TreeItem(
        '全局命令',
        vscode.TreeItemCollapsibleState.Expanded
      );
      globalCommandsGroup.contextValue = 'global-commands-group';
      globalCommandsGroup.iconPath = new vscode.ThemeIcon('globe');
      items.push(globalCommandsGroup);

      // 添加本地命令组 - 确保设置正确的 contextValue
      const localCommands = localCommandsLoader.loadLocalCommands();
      if (localCommands.length > 0) {
        const localCommandsGroup = new vscode.TreeItem(
          '本地命令',
          vscode.TreeItemCollapsibleState.Expanded
        );
        localCommandsGroup.contextValue = 'local-commands-group';
        localCommandsGroup.iconPath = new vscode.ThemeIcon('folder');
        items.push(localCommandsGroup);
      }

      return items;
    } else if (element.contextValue === 'global-commands-group') {
      // 全局命令
      const configData = configLoader.loadConfig();
      const customCommands = configData.customCommands || [];
      return this.createCommandItems(customCommands, 'global-command');
    } else if (element.contextValue === 'local-commands-group') {
      // 本地命令
      const localCommands = localCommandsLoader.loadLocalCommands();
      return this.createCommandItems(localCommands, 'local-command');
    }
    return [];
  }

  /**
   * 创建命令项列表 - 确保全局命令和本地命令使用相同的创建方法
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
      // 创建一个标准的 TreeItem 而不是 ServerTreeItem
      const treeItem = new vscode.TreeItem(
        typeof cmdObj === 'string' ? cmdObj : cmdObj.name,
        vscode.TreeItemCollapsibleState.None
      );
      
      // 设置上下文值
      treeItem.contextValue = contextValue;
      
      // 设置命令对象
      treeItem.commandObj = typeof cmdObj === 'string' ? { command: cmdObj } : cmdObj;
      
      // 设置服务器
      treeItem.server = server;
      
      // 设置描述
      if (contextValue === 'local-command' && treeItem.commandObj.workspaceFolder) {
        treeItem.description = treeItem.commandObj.workspaceFolder;
      } else if (treeItem.commandObj.description) {
        treeItem.description = treeItem.commandObj.description;
      }
      
      // 设置工具提示
      treeItem.tooltip = `执行命令: ${treeItem.commandObj.command}`;
      if (treeItem.commandObj.description) {
        treeItem.tooltip += `\n${treeItem.commandObj.description}`;
      }
      
      // 设置图标
      if (treeItem.commandObj.icon) {
        treeItem.iconPath = new vscode.ThemeIcon(treeItem.commandObj.icon);
      } else {
        treeItem.iconPath = getIconForCommand(treeItem.commandObj.command);
      }
      
      // 移除点击命令时的自动执行
      treeItem.command = undefined;
      
      return treeItem;
    });
  }
}

/**
 * 命令树项
 */
class CommandTreeItem extends vscode.TreeItem {
  /**
   * 创建命令树项
   * @param {Object} commandObj - 命令对象
   * @param {boolean} isLocal - 是否为本地命令
   * @param {Object} server - 服务器对象
   */
  constructor(commandObj, isLocal, server) {
    super(commandObj.name, vscode.TreeItemCollapsibleState.None);

    this.commandObj = commandObj;
    this.isLocal = isLocal;
    this.server = server;

    // 设置上下文
    this.contextValue = isLocal ? 'localCommand' : 'globalCommand';

    // 设置描述
    if (commandObj.description) {
      this.description = commandObj.description;
    } else if (commandObj.workspaceFolder) {
      this.description = commandObj.workspaceFolder;
    }

    this.tooltip = `执行命令: ${commandObj.command}`;
    if (commandObj.description) {
      this.tooltip += `\n${commandObj.description}`;
    }

    // 移除点击命令时的自动执行
    this.command = undefined;
  }
}

module.exports = {
  ServerTreeProvider,
  CommandTreeProvider,
};
