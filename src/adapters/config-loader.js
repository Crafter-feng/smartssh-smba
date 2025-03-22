/**
 * 配置加载适配器
 * 处理所有与配置文件加载和处理相关的功能
 */

const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

// 全局配置缓存
let configCache = null;
let workspaceConfigCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 1000; // 1秒缓存有效期

/**
 * 获取扩展配置
 * @returns {Object} - 配置对象
 */
function getConfig() {
  try {
    // 如果缓存存在且有效，返回缓存
    const now = Date.now();
    if (configCache && (now - lastLoadTime < CACHE_TTL)) {
      return configCache;
    }

    // 获取扩展配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');

    // 获取全局配置
    const globalConfig = config.inspect('config').globalValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 获取工作区配置
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 合并配置，模拟原始loadConfig功能
    const integratedConfig = {
      showHostsInPickLists: workspaceConfig.showHostsInPickLists || globalConfig.showHostsInPickLists || false,
      serverList: [...(globalConfig.serverList || []), ...(workspaceConfig.serverList || [])],
      // 确保全局命令不包含工作区标识
      customCommands: (globalConfig.customCommands || []).map(cmd => ({
        ...cmd,
        isWorkspaceCommand: false,
      })),
      // 添加工作区标识到工作区命令
      workspaceCommands: (workspaceConfig.customCommands || []).map(cmd => ({
        ...cmd,
        isWorkspaceCommand: true,
        workspaceName: vscode.workspace.name || '当前工作区',
      })),
    };

    // 更新缓存和时间戳
    configCache = integratedConfig;
    lastLoadTime = now;

    logger.info(`配置加载完成，服务器数量: ${integratedConfig.serverList ? integratedConfig.serverList.length : 0}`);

    return integratedConfig;
  } catch (error) {
    logger.error(`获取配置时出错: ${error.message}`);
    // 返回默认配置
    return {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
      workspaceCommands: [],
    };
  }
}

/**
 * 更新扩展配置
 * @param {string} section - 配置节
 * @param {any} value - 新值
 * @param {boolean} global - 是否为全局配置
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateConfig(section, value, global = true) {
  try {
    // 获取扩展配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');

    // 确定配置目标
    const target = global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;

    // 更新配置
    await config.update(section, value, target);

    // 清除缓存
    configCache = null;
    lastLoadTime = 0;

    return true;
  } catch (error) {
    logger.error(`更新配置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 获取服务器列表
 * @returns {Array} 服务器列表
 */
function getServerList() {
  try {
    const config = getConfig();
    // 直接从配置中获取服务器列表
    const servers = config.serverList || [];

    // 处理向后兼容性：将旧的smbMapping合并到pathMappings
    servers.forEach(server => {
      if (server.smbMapping && server.smbMapping.localPath && server.smbMapping.remotePath) {
        if (!server.pathMappings) {
          server.pathMappings = [];
        }

        // 检查是否已存在相同的映射
        const existingMapping = server.pathMappings.find(
          mapping => mapping.localPath === server.smbMapping.localPath &&
            mapping.remotePath === server.smbMapping.remotePath
        );

        // 如果不存在相同映射，则添加
        if (!existingMapping) {
          server.pathMappings.push({
            localPath: server.smbMapping.localPath,
            remotePath: server.smbMapping.remotePath,
          });
        }
      }
    });

    return servers;
  } catch (error) {
    logger.error(`获取服务器列表失败: ${error.message}`);
    return [];
  }
}

/**
 * 添加服务器
 * @param {Object} server - 服务器配置
 * @param {boolean} saveToWorkspace - 是否保存到工作区，默认为false（保存到全局）
 * @returns {Promise<boolean>} - 添加是否成功
 */
async function addServer(server, saveToWorkspace = false) {
  try {
    if (!server || !server.name || !server.host || !server.username) {
      logger.error('服务器配置无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');

    // 确定目标配置（全局或工作区）
    const configTarget = saveToWorkspace
      ? config.inspect('config').workspaceValue || { serverList: [] }
      : config.inspect('config').globalValue || { serverList: [] };

    // 确保serverList存在
    if (!configTarget.serverList) {
      configTarget.serverList = [];
    }

    // 检查是否已存在同名服务器
    if (configTarget.serverList.some(s => s.name === server.name)) {
      logger.error(`服务器名称 ${server.name} 已存在`);
      return false;
    }

    // 添加新服务器
    configTarget.serverList.push(server);

    // 更新配置
    return await updateConfig('config', configTarget, !saveToWorkspace);
  } catch (error) {
    logger.error(`添加服务器时出错: ${error.message}`);
    return false;
  }
}

/**
 * 更新服务器
 * @param {string} name - 服务器名称
 * @param {Object} updatedServer - 更新后的服务器配置
 * @param {boolean} saveToWorkspace - 是否保存到工作区，默认为false（保存到全局）
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateServer(name, updatedServer, saveToWorkspace = false) {
  try {
    if (!name || !updatedServer) {
      logger.error('参数无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');

    // 确定目标配置（全局或工作区）
    const configTarget = saveToWorkspace
      ? config.inspect('config').workspaceValue || { serverList: [] }
      : config.inspect('config').globalValue || { serverList: [] };

    // 确保serverList存在
    if (!configTarget.serverList) {
      configTarget.serverList = [];
      logger.error('服务器列表不存在');
      return false;
    }

    // 查找服务器索引
    const index = configTarget.serverList.findIndex(s => s.name === name);
    if (index === -1) {
      logger.error(`找不到名为 ${name} 的服务器`);
      return false;
    }

    // 如果名称发生变化，需要检查新名称是否已存在
    if (updatedServer.name !== name) {
      if (configTarget.serverList.some(s => s.name === updatedServer.name)) {
        logger.error(`服务器名称 ${updatedServer.name} 已存在`);
        return false;
      }
    }

    // 更新服务器
    configTarget.serverList[index] = updatedServer;

    // 更新配置
    return await updateConfig('config', configTarget, !saveToWorkspace);
  } catch (error) {
    logger.error(`更新服务器时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除服务器
 * @param {string} name - 服务器名称
 * @param {boolean} deleteFromWorkspace - 是否从工作区删除，默认为false（从全局删除）
 * @returns {Promise<boolean>} - 删除是否成功
 */
async function deleteServer(name, deleteFromWorkspace = false) {
  try {
    if (!name) {
      logger.error('服务器名称不能为空');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');

    // 确定目标配置（全局或工作区）
    const configTarget = deleteFromWorkspace
      ? config.inspect('config').workspaceValue || { serverList: [] }
      : config.inspect('config').globalValue || { serverList: [] };

    // 确保serverList存在
    if (!configTarget.serverList) {
      configTarget.serverList = [];
      logger.error('服务器列表不存在');
      return false;
    }

    // 查找服务器索引
    const index = configTarget.serverList.findIndex(s => s.name === name);
    if (index === -1) {
      logger.error(`找不到名为 ${name} 的服务器`);
      return false;
    }

    // 删除服务器
    configTarget.serverList.splice(index, 1);

    // 更新配置
    return await updateConfig('config', configTarget, !deleteFromWorkspace);
  } catch (error) {
    logger.error(`删除服务器时出错: ${error.message}`);
    return false;
  }
}

/**
 * 打开服务器设置
 * @returns {Promise<boolean>} - 打开是否成功
 */
async function openServerSettings() {
  try {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'smartssh-smba.servers'
    );
    return true;
  } catch (error) {
    logger.error(`打开服务器设置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 获取工作区配置文件路径
 * @returns {string|null} - 工作区配置文件路径
 */
function getWorkspaceConfigPath() {
  try {
    // 获取当前工作区文件夹
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }

    // 使用第一个工作区文件夹
    const workspaceFolder = folders[0];

    // 构建工作区配置文件路径
    return path.join(workspaceFolder.uri.fsPath, '.smartssh-smba.json');
  } catch (error) {
    logger.error(`获取工作区配置路径时出错: ${error.message}`);
    return null;
  }
}

/**
 * 确保工作区配置文件存在
 * @returns {Promise<boolean>} - 配置文件是否存在或创建成功
 */
async function ensureWorkspaceConfigExists() {
  try {
    const configPath = getWorkspaceConfigPath();
    if (!configPath) {
      return false;
    }

    try {
      // 检查文件是否存在
      await fs.access(configPath);
      return true;
    } catch (error) {
      // 文件不存在，创建新文件
      await fs.writeFile(configPath, JSON.stringify({
        customCommands: [],
      }, null, 2));

      return true;
    }
  } catch (error) {
    logger.error(`确保工作区配置存在时出错: ${error.message}`);
    return false;
  }
}

/**
 * 加载工作区配置
 * @returns {Promise<Object>} - 工作区配置
 */
async function loadWorkspaceConfig() {
  try {
    // 如果缓存存在且有效，返回缓存
    if (workspaceConfigCache) {
      return workspaceConfigCache;
    }

    // 获取配置文件路径
    const configPath = getWorkspaceConfigPath();
    if (!configPath) {
      return {};
    }

    // 确保配置文件存在
    const exists = await ensureWorkspaceConfigExists();
    if (!exists) {
      return {};
    }

    // 读取配置文件
    const configData = await fs.readFile(configPath, 'utf8');

    // 解析JSON
    const config = JSON.parse(configData);

    // 缓存配置
    workspaceConfigCache = config;

    return config;
  } catch (error) {
    logger.error(`加载工作区配置时出错: ${error.message}`);
    return {};
  }
}

/**
 * 保存工作区配置
 * @param {Object} config - 工作区配置
 * @returns {Promise<boolean>} - 保存是否成功
 */
async function saveWorkspaceConfig(config) {
  try {
    // 获取配置文件路径
    const configPath = getWorkspaceConfigPath();
    if (!configPath) {
      return false;
    }

    // 确保配置文件存在
    const exists = await ensureWorkspaceConfigExists();
    if (!exists) {
      return false;
    }

    // 保存配置
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    // 更新缓存
    workspaceConfigCache = config;

    return true;
  } catch (error) {
    logger.error(`保存工作区配置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 获取工作区命令列表
 * @returns {Array} - 工作区命令列表
 */
function getWorkspaceCommands() {
  try {
    // 获取配置
    const config = getConfig();
    
    // 直接从配置中获取工作区命令
    return config.workspaceCommands || [];
  } catch (error) {
    logger.error(`获取工作区命令时出错: ${error.message}`);
    return [];
  }
}

/**
 * 添加工作区命令
 * @param {Object} command - 命令对象
 * @returns {Promise<boolean>} - 添加是否成功
 */
async function addWorkspaceCommand(command) {
  try {
    if (!command || !command.command) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 确保customCommands数组存在
    if (!workspaceConfig.customCommands) {
      workspaceConfig.customCommands = [];
    }

    // 添加命令
    workspaceConfig.customCommands.push(command);

    // 更新配置
    return await updateConfig('config', workspaceConfig, false);
  } catch (error) {
    logger.error(`添加工作区命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 更新工作区命令
 * @param {Object} oldCommand - 旧命令对象
 * @param {Object} newCommand - 新命令对象
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateWorkspaceCommand(oldCommand, newCommand) {
  try {
    if (!oldCommand || !newCommand) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 确保customCommands数组存在
    if (!workspaceConfig.customCommands || !Array.isArray(workspaceConfig.customCommands)) {
      logger.error('工作区命令列表无效');
      return false;
    }

    // 查找命令索引
    const index = workspaceConfig.customCommands.findIndex(cmd =>
      cmd.command === oldCommand.command && cmd.name === oldCommand.name
    );

    if (index === -1) {
      logger.error('找不到要更新的命令');
      return false;
    }

    // 更新命令
    workspaceConfig.customCommands[index] = newCommand;

    // 更新配置
    return await updateConfig('config', workspaceConfig, false);
  } catch (error) {
    logger.error(`更新工作区命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除工作区命令
 * @param {Object} command - 命令对象
 * @returns {Promise<boolean>} - 删除是否成功
 */
async function deleteWorkspaceCommand(command) {
  try {
    if (!command) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 确保customCommands数组存在
    if (!workspaceConfig.customCommands || !Array.isArray(workspaceConfig.customCommands)) {
      logger.error('工作区命令列表无效');
      return false;
    }

    // 过滤掉要删除的命令
    const originalLength = workspaceConfig.customCommands.length;
    workspaceConfig.customCommands = workspaceConfig.customCommands.filter(cmd =>
      !(cmd.command === command.command && cmd.name === command.name)
    );

    // 检查是否找到并删除了命令
    if (workspaceConfig.customCommands.length === originalLength) {
      logger.error('找不到要删除的命令');
      return false;
    }

    // 更新配置
    return await updateConfig('config', workspaceConfig, false);
  } catch (error) {
    logger.error(`删除工作区命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 添加全局命令
 * @param {Object} command - 命令对象
 * @returns {Promise<boolean>} - 添加是否成功
 */
async function addGlobalCommand(command) {
  try {
    if (!command || !command.command) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const globalConfig = config.inspect('config').globalValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 添加命令到全局配置
    if (!globalConfig.customCommands) {
      globalConfig.customCommands = [];
    }
    globalConfig.customCommands.push(command);

    // 更新配置
    return await updateConfig('config', globalConfig);
  } catch (error) {
    logger.error(`添加全局命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 更新全局命令
 * @param {Object} oldCommand - 旧命令对象
 * @param {Object} newCommand - 新命令对象
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateGlobalCommand(oldCommand, newCommand) {
  try {
    if (!oldCommand || !newCommand) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const globalConfig = config.inspect('config').globalValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 确保customCommands存在
    if (!globalConfig.customCommands) {
      globalConfig.customCommands = [];
      logger.error('找不到要更新的命令');
      return false;
    }

    // 查找命令索引
    const index = globalConfig.customCommands.findIndex(cmd =>
      cmd.command === oldCommand.command && cmd.name === oldCommand.name
    );

    if (index === -1) {
      logger.error('找不到要更新的命令');
      return false;
    }

    // 更新命令
    globalConfig.customCommands[index] = newCommand;

    // 更新配置
    return await updateConfig('config', globalConfig);
  } catch (error) {
    logger.error(`更新全局命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除全局命令
 * @param {Object} command - 命令对象
 * @returns {Promise<boolean>} - 删除是否成功
 */
async function deleteGlobalCommand(command) {
  try {
    if (!command) {
      logger.error('命令无效');
      return false;
    }

    // 获取当前配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const globalConfig = config.inspect('config').globalValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 确保customCommands存在
    if (!globalConfig.customCommands || !Array.isArray(globalConfig.customCommands)) {
      logger.error('命令列表无效');
      return false;
    }

    // 过滤掉要删除的命令
    const originalLength = globalConfig.customCommands.length;
    globalConfig.customCommands = globalConfig.customCommands.filter(cmd =>
      !(cmd.command === command.command && cmd.name === command.name)
    );

    // 检查是否找到并删除了命令
    if (globalConfig.customCommands.length === originalLength) {
      logger.error('找不到要删除的命令');
      return false;
    }

    // 更新配置
    return await updateConfig('config', globalConfig);
  } catch (error) {
    logger.error(`删除全局命令时出错: ${error.message}`);
    return false;
  }
}

/**
 * 刷新配置缓存
 */
function refreshCache() {
  configCache = null;
  workspaceConfigCache = null;
}

// 监听配置更改事件
vscode.workspace.onDidChangeConfiguration(event => {
  // 检查是否为我们的扩展配置
  if (event.affectsConfiguration('smartssh-smba')) {
    // 清除缓存
    refreshCache();
  }
});

/**
 * 更新工作区命令列表
 * @param {Array} commands - 命令列表
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateWorkspaceCommands(commands) {
  try {
    logger.info('更新工作区命令');
    
    // 获取当前工作区配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 更新工作区命令
    workspaceConfig.customCommands = commands.map(cmd => {
      // 移除工作区特定属性，但保留contextValue
      const { workspaceName, ...cleanCmd } = cmd;
      return cleanCmd;
    });

    // 保存到工作区配置
    await config.update('config', workspaceConfig, vscode.ConfigurationTarget.Workspace);
    
    // 清除缓存
    refreshCache();
    
    logger.info('工作区命令已更新');
    return true;
  } catch (error) {
    logger.error(`更新工作区命令时出错: ${error.message}`);
    return false;
  }
}

module.exports = {
  getConfig,
  updateConfig,
  getServerList,
  addServer,
  updateServer,
  deleteServer,
  openServerSettings,
  getWorkspaceConfigPath,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  getWorkspaceCommands,
  addWorkspaceCommand,
  updateWorkspaceCommand,
  deleteWorkspaceCommand,
  addGlobalCommand,
  updateGlobalCommand,
  deleteGlobalCommand,
  refreshCache,
  updateWorkspaceCommands,
};
