/**
 * 服务器树视图提供者模块
 * 为VS Code侧边栏提供服务器树视图
 */

const vscode = require('vscode');
const configLoader = require('../../adapters/config-loader');
const { logger } = require('../../utils/logger');
const BaseTreeItem = require('./base-tree-item');

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
    }
  }

  /**
   * 设置服务器项的属性
   */
  setupServerItem() {
    // 设置图标
    this.iconPath = new vscode.ThemeIcon('server');
    
    // 设置工具提示
    if (this.server) {
      this.tooltip = `${this.server.name} (${this.server.username}@${this.server.host})`;
      if (this.server.port && this.server.port !== 22) {
        this.tooltip += `:${this.server.port}`;
      }
    } else {
      this.tooltip = this.label;
    }
    
    // 设置描述
    if (this.server) {
      this.description = `${this.server.username}@${this.server.host}`;
    }
    
    // 设置点击命令
    this.command = {
      command: 'smartssh-smba.connectToServer',
      title: '连接到服务器',
      arguments: [this.server.name]
    };
  }

  /**
   * 设置配置项的属性
   */
  setupConfigItem() {
    // 设置图标
    if (this.label.toLowerCase().includes('username') || this.label.toLowerCase().includes('user')) {
      this.iconPath = new vscode.ThemeIcon('person');
    } else if (this.label.toLowerCase().includes('host') || this.label.toLowerCase().includes('server')) {
      this.iconPath = new vscode.ThemeIcon('globe');
    } else if (this.label.toLowerCase().includes('port')) {
      this.iconPath = new vscode.ThemeIcon('plug');
    } else if (this.label.toLowerCase().includes('password')) {
      this.iconPath = new vscode.ThemeIcon('lock');
    } else if (this.label.toLowerCase().includes('key')) {
      this.iconPath = new vscode.ThemeIcon('key');
    } else {
      this.iconPath = new vscode.ThemeIcon('settings');
    }
    
    // 设置描述
    this.description = this.server ? this.server[this.configKey] : '';
  }
}

/**
 * 服务器树视图提供者
 */
class ServerTreeProvider {
  /**
   * 创建服务器树视图提供者
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
   * @param {ServerTreeItem} element - 树项元素
   * @returns {Promise<ServerTreeItem[]>} - 子树项数组
   */
  async getChildren(element) {
    try {
      if (!element) {
        // 返回根节点
        return this.getRootNodes();
      } else if (element.contextValue === 'server') {
        // 返回服务器的子节点
        return this.getServerChildNodes(element.server);
      } else if (element.contextValue === 'config-group') {
        // 返回配置组的子节点
        return this.getConfigNodes(element.server);
      } else if (element.contextValue === 'init-commands-group') {
        // 返回初始化命令组的子节点
        return this.getInitCommandNodes(element.server);
      } else if (element.contextValue === 'smb-group') {
        // 返回SMB映射组的子节点
        return this.getPathMappingNodes(element.server);
      }
      
      return [];
    } catch (error) {
      logger.error(`获取树节点时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取根节点
   * @returns {ServerTreeItem[]} - 树项数组
   */
  getRootNodes() {
    try {
      // 获取服务器列表
      const servers = configLoader.getServerList() || [];
      
      if (servers.length === 0) {
        // 如果没有服务器，返回提示
        return [
          new ServerTreeItem(
            '点击添加服务器...',
            vscode.TreeItemCollapsibleState.None,
            null,
            'no-server'
          )
        ];
      }
      
      // 为每个服务器创建树项
      return servers.map(server => 
        new ServerTreeItem(
          server.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          server,
          'server'
        )
      );
    } catch (error) {
      logger.error(`获取根节点时出错: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取服务器的子节点
   * @param {Object} server - 服务器配置
   * @returns {ServerTreeItem[]} - 树项数组
   */
  getServerChildNodes(server) {
    if (!server) {
      return [];
    }
    
    const children = [];
    
    // 添加配置组
    children.push(
      new ServerTreeItem(
        '配置',
        vscode.TreeItemCollapsibleState.Collapsed,
        server,
        'config-group'
      )
    );
    
    // 添加初始化命令组（如果有）
    if (server.initCommands && server.initCommands.length > 0) {
      children.push(
        new ServerTreeItem(
          '初始化命令',
          vscode.TreeItemCollapsibleState.Collapsed,
          server,
          'init-commands-group'
        )
      );
    }
    
    // 添加路径映射组（如果有）
    const hasPathMappings = 
      (server.pathMappings && server.pathMappings.length > 0) ||
      (server.smbMappingList && server.smbMappingList.length > 0) ||
      (server.smbMapping && server.smbMapping.localPath);
    
    if (hasPathMappings) {
      children.push(
        new ServerTreeItem(
          '路径映射',
          vscode.TreeItemCollapsibleState.Collapsed,
          server,
          'smb-group'
        )
      );
    }
    
    return children;
  }

  /**
   * 获取配置节点
   * @param {Object} server - 服务器配置
   * @returns {ServerTreeItem[]} - 树项数组
   */
  getConfigNodes(server) {
    if (!server) {
      return [];
    }
    
    const configKeys = ['host', 'username', 'port', 'privateKey', 'agent'];
    const nodes = [];
    
    for (const key of configKeys) {
      if (server[key] !== undefined) {
        nodes.push(
          new ServerTreeItem(
            key.charAt(0).toUpperCase() + key.slice(1),
            vscode.TreeItemCollapsibleState.None,
            server,
            'config',
            key
          )
        );
      }
    }
    
    return nodes;
  }

  /**
   * 获取初始化命令节点
   * @param {Object} server - 服务器配置
   * @returns {ServerTreeItem[]} - 树项数组
   */
  getInitCommandNodes(server) {
    if (!server || !server.initCommands || !Array.isArray(server.initCommands)) {
      return [];
    }
    
    return server.initCommands.map((cmd, index) => 
      new ServerTreeItem(
        cmd,
        vscode.TreeItemCollapsibleState.None,
        server,
        'init-command',
        null,
        { command: cmd, index, description: `初始化命令 #${index + 1}` }
      )
    );
  }

  /**
   * 获取路径映射节点
   * @param {Object} server - 服务器配置
   * @returns {ServerTreeItem[]} - 树项数组
   */
  getPathMappingNodes(server) {
    if (!server) {
      return [];
    }
    
    const nodes = [];
    
    // 处理新的pathMappings
    if (server.pathMappings && Array.isArray(server.pathMappings)) {
      server.pathMappings.forEach((mapping, index) => {
        nodes.push(
          new ServerTreeItem(
            `映射 #${index + 1}`,
            vscode.TreeItemCollapsibleState.None,
            server,
            'path-mapping',
            null,
            {
              localPath: mapping.localPath,
              remotePath: mapping.remotePath,
              description: `${mapping.localPath} → ${mapping.remotePath}`
            }
          )
        );
      });
    }
    
    // 处理旧的smbMappingList
    if (server.smbMappingList && Array.isArray(server.smbMappingList)) {
      server.smbMappingList.forEach((mapping, index) => {
        nodes.push(
          new ServerTreeItem(
            `SMB映射 #${index + 1}`,
            vscode.TreeItemCollapsibleState.None,
            server,
            'path-mapping',
            null,
            {
              localPath: mapping.localPath,
              remotePath: mapping.remotePath,
              description: `${mapping.localPath} → ${mapping.remotePath}`
            }
          )
        );
      });
    }
    
    // 处理旧的单个smbMapping
    if (server.smbMapping && server.smbMapping.localPath && server.smbMapping.remotePath) {
      nodes.push(
        new ServerTreeItem(
          'SMB映射',
          vscode.TreeItemCollapsibleState.None,
          server,
          'path-mapping',
          null,
          {
            localPath: server.smbMapping.localPath,
            remotePath: server.smbMapping.remotePath,
            description: `${server.smbMapping.localPath} → ${server.smbMapping.remotePath}`
          }
        )
      );
    }
    
    return nodes;
  }

  /**
   * 获取树项
   * @param {ServerTreeItem} element - 树项元素
   * @returns {ServerTreeItem} - 树项
   */
  getTreeItem(element) {
    return element;
  }
}

module.exports = {
  ServerTreeProvider,
  ServerTreeItem
}; 