const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * 加载本地命令配置
 * @returns {Array} 本地命令数组
 */
function loadLocalCommands() {
  // 检查是否启用了本地命令
  const configData = vscode.workspace.getConfiguration('smartssh-smba').get('config') || {};
  const enableLocalCommands = configData.enableLocalCommands !== undefined ? configData.enableLocalCommands : true;
  
  if (!enableLocalCommands) {
    return [];
  }

  // 获取工作区文件夹
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const localCommands = [];

  // 遍历所有工作区文件夹
  workspaceFolders.forEach(folder => {
    const folderName = folder.name;
    
    try {
      // 从工作区的 settings.json 中读取本地命令配置
      const workspaceConfig = vscode.workspace.getConfiguration('smartssh-smba', folder.uri);
      const commands = workspaceConfig.get('localCommands') || [];

      if (Array.isArray(commands)) {
        // 为每个命令添加工作区标识
        commands.forEach(cmd => {
          if (cmd && cmd.name && cmd.command) {
            localCommands.push({
              ...cmd,
              workspaceFolder: folderName,
              workspacePath: folder.uri.fsPath
            });
          }
        });
      }
    } catch (error) {
      console.error(`加载工作区 ${folderName} 的本地命令时出错:`, error);
    }
  });

  return localCommands;
}

/**
 * 监听本地命令文件变更
 * @param {Function} callback - 文件变更时的回调函数
 * @returns {vscode.Disposable} - 文件监听器
 */
function watchLocalCommandsFile(callback) {
  // 获取本地命令文件路径
  const localCommandsFile = vscode.workspace.getConfiguration('smartssh-smba').get('localCommandsFile');
  if (!localCommandsFile) {
    return null;
  }

  // 获取工作区文件夹
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  // 创建文件系统监听器
  const fileWatcher = vscode.workspace.createFileSystemWatcher(`**/${localCommandsFile}`);
  
  // 监听文件创建、修改和删除事件
  fileWatcher.onDidCreate(callback);
  fileWatcher.onDidChange(callback);
  fileWatcher.onDidDelete(callback);

  return fileWatcher;
}

/**
 * 创建本地命令配置
 * @param {string} folderPath - 工作区文件夹路径
 * @returns {Promise<boolean>} - 是否成功创建
 */
async function createLocalCommandsConfig(folderPath) {
  try {
    // 确保 .vscode 文件夹存在
    const vscodeFolder = path.join(folderPath, '.vscode');
    if (!fs.existsSync(vscodeFolder)) {
      fs.mkdirSync(vscodeFolder, { recursive: true });
    }

    // 获取工作区配置
    const folderUri = vscode.Uri.file(folderPath);
    const workspaceConfig = vscode.workspace.getConfiguration('smartssh-smba', folderUri);

    // 检查是否已有本地命令配置
    const existingCommands = workspaceConfig.get('localCommands');
    if (existingCommands && existingCommands.length > 0) {
      // 如果已有配置，打开设置文件
      vscode.commands.executeCommand(
        'workbench.action.openWorkspaceSettings',
        {
          query: 'smartssh-smba.localCommands'
        }
      );
      return true;
    }

    // 创建默认命令
    const defaultCommands = [
      {
        "name": "列出文件",
        "command": "ls -la",
        "description": "列出当前目录下的所有文件和文件夹"
      },
      {
        "name": "查看项目状态",
        "command": "git status",
        "description": "查看 Git 仓库状态"
      },
      {
        "name": "构建项目",
        "command": "npm run build",
        "description": "构建当前项目"
      }
    ];
    
    // 更新工作区配置
    await workspaceConfig.update('localCommands', defaultCommands, vscode.ConfigurationTarget.WorkspaceFolder);
    
    // 打开 settings.json 文件以便用户编辑
    const settingsPath = path.join(folderPath, '.vscode', 'settings.json');
    const settingsUri = vscode.Uri.file(settingsPath);
    
    try {
      await vscode.commands.executeCommand('vscode.open', settingsUri);
    } catch (error) {
      console.log('无法打开 settings.json 文件:', error);
    }
    
    return true;
  } catch (error) {
    console.error('创建本地命令配置时出错:', error);
    return false;
  }
}

module.exports = {
  loadLocalCommands,
  watchLocalCommandsFile,
  createLocalCommandsConfig
}; 