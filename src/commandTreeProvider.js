/**
 * 命令树视图提供者
 */
class CommandTreeProvider {
  constructor(servers) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.servers = servers || [];
    this.globalCommands = [];
    this.localCommands = [];
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      // 根节点：显示全局命令和本地命令
      const items = [];

      // 添加全局命令组
      if (this.globalCommands && this.globalCommands.length > 0) {
        items.push(new CommandGroup('全局命令', 'globalCommands'));
      }

      // 添加本地命令组
      if (this.localCommands && this.localCommands.length > 0) {
        items.push(new CommandGroup('本地命令', 'localCommands'));
      }

      // 添加服务器命令组
      if (this.servers && this.servers.length > 0) {
        this.servers.forEach(server => {
          if (server.configuration.commands && server.configuration.commands.length > 0) {
            items.push(new CommandGroup(server.name, 'serverCommands', server));
          }
        });
      }

      return items;
    } else if (element.contextValue === 'globalCommands') {
      // 全局命令组：显示所有全局命令
      return this.globalCommands.map(cmd => this.createCommandItem(cmd, 'globalCommand'));
    } else if (element.contextValue === 'localCommands') {
      // 本地命令组：显示所有本地命令
      return this.localCommands.map(cmd => this.createCommandItem(cmd, 'localCommand', null, cmd.workspaceFolder));
    } else if (element.contextValue === 'serverCommands') {
      // 服务器命令组：显示特定服务器的所有命令
      const server = element.server;
      if (server && server.configuration.commands) {
        return server.configuration.commands.map(cmd => this.createCommandItem(cmd, 'serverCommand', server));
      }
    }

    return [];
  }

  createCommandItem(cmd, contextValue, server, workspaceFolder) {
    const cmdObj = typeof cmd === 'string' ? { name: cmd, command: cmd, description: '' } : cmd;

    const treeItem = new vscode.TreeItem(cmdObj.name, vscode.TreeItemCollapsibleState.None);
    treeItem.tooltip = cmdObj.description || cmdObj.command;
    treeItem.description = cmdObj.command;
    treeItem.contextValue = contextValue;

    // 点击命令项不执行任何命令
    treeItem.command = undefined;

    // 存储命令对象和服务器信息
    treeItem.commandObj = cmdObj;
    treeItem.server = server;
    treeItem.workspaceFolder = workspaceFolder;

    // 设置图标
    treeItem.iconPath = getIconForCommand(cmdObj.command);

    return treeItem;
  }
}

/**
 * 命令组类
 */
class CommandGroup extends vscode.TreeItem {
  constructor(label, contextValue, server) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = contextValue;
    this.server = server;

    if (contextValue === 'serverCommands') {
      this.description = `${server.configuration.username}@${server.configuration.host}`;
      this.tooltip = `${server.name} (${server.configuration.username}@${server.configuration.host})`;
      this.iconPath = new vscode.ThemeIcon('server');
    } else if (contextValue === 'globalCommands') {
      this.tooltip = '全局命令 - 适用于所有服务器';
      this.iconPath = new vscode.ThemeIcon('globe');
    } else if (contextValue === 'localCommands') {
      this.tooltip = '本地命令 - 适用于当前工作区';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }
} 