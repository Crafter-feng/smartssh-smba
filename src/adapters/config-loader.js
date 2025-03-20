/**
 * 配置加载适配器
 * 处理所有与配置文件加载和处理相关的功能
 */

const vscode = require('vscode');
const fs = require('fs').promises;
const path = require('path');
const homedir = require('os').homedir();
const fsSync = require('fs');
const { logger } = require('../utils/logger');

// 全局配置缓存
let configCache = null;
let workspaceConfigCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 1000; // 1秒缓存有效期

/**
 * 格式化服务器配置元素
 * @param {Object} element - 服务器配置元素
 * @returns {Object} - 格式化后的配置
 */
function formatServerConfig(element) {
  var show_hosts = vscode.workspace.getConfiguration('smartssh-smba').showHostsInPickLists;
  var config = {
    name: (show_hosts) ? element.username + '@' + element.host : element.name, // 用于服务器列表
    username: element.username, // 用于授权
    password: element.password, // 用于授权（可以为undefined）
    host: element.host, // 用于授权
    port: element.port, // 用于授权（可以为undefined）
    privateKey: element.privateKey, // 用于授权（可以为undefined）
    agent: element.agent, // 用于授权（可以为undefined）
    customCommands: element.customCommands, // 用于指定会话开始时执行的命令
    smbMappingList: [], // 初始化为空数组
  };

  // 保存已添加路径的映射，防止重复
  const addedMappings = new Set();

  // 合并 smbMapping 到 smbMappingList
  if (element.smbMapping && (element.smbMapping.localPath || element.smbMapping.remotePath)) {
    const mappingKey = `${element.smbMapping.localPath || ''}:${element.smbMapping.remotePath || ''}`;
    if (!addedMappings.has(mappingKey)) {
      config.smbMappingList.push({
        localPath: element.smbMapping.localPath,
        remotePath: element.smbMapping.remotePath,
      });
      addedMappings.add(mappingKey);
    }
  }

  // 添加新的 smbMappingList
  if (element.smbMappingList && Array.isArray(element.smbMappingList)) {
    element.smbMappingList.forEach(mapping => {
      if (mapping && (mapping.localPath || mapping.remotePath)) {
        const mappingKey = `${mapping.localPath || ''}:${mapping.remotePath || ''}`;
        if (!addedMappings.has(mappingKey)) {
          config.smbMappingList.push({
            localPath: mapping.localPath,
            remotePath: mapping.remotePath,
          });
          addedMappings.add(mappingKey);
        }
      }
    });
  }

  return config;
}

// 路径连接函数
function pathjoin() {
  return path.normalize(path.join.apply(this, arguments)).replace(/\\/g, '/');
}

// 获取用户设置位置
function getUserSettingsLocation(filename) {
  var folder = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.platform == 'linux' ? pathjoin(homedir, '.config') : '/var/local');
  if (/^[A-Z]:[/\\]/.test(folder)) folder = folder.substring(0, 1).toLowerCase() + folder.substring(1);
  return pathjoin(folder, '/Code/User/', filename ? filename : '');
}

// 检查文件是否存在
function fileExists(filename, local = false) {
  var result = true;
  if (fsSync.accessSync) {
    try {
      fsSync.accessSync(
        (!local) ? getUserSettingsLocation(filename) : filename
      );
    } catch (e) {
      result = false;
    }
  } else {
    result = fsSync.existsSync(
      (!local) ? getUserSettingsLocation(filename) : filename
    );
  }
  return result;
}

/**
 * 加载smartssh-smba配置
 * @returns {Object} - 配置对象
 */
function loadSmartSshConfig() {
  try {
    // 获取整合后的配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const integratedConfig = config.get('config') || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 从配置中获取服务器列表
    const serverList = integratedConfig.serverList || [];

    // 转换为所需格式
    const configs = serverList.map(server => {
      return {
        name: server.name,
        configuration: server,
      };
    });

    return {
      result: true,
      configs: configs,
    };
  } catch (error) {
    logger.error('加载 SmartSSH-SMBA 配置时出错:', error);
    return {
      result: false,
      configs: [],
    };
  }
}

/**
 * 获取扩展配置
 * @returns {Object} - 配置对象
 */
function getConfig() {
  try {
    // 如果缓存存在且有效，返回缓存
    if (configCache) {
      return configCache;
    }

    // 获取扩展配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    
    // 将配置复制到一个普通对象以确保可以修改
    configCache = JSON.parse(JSON.stringify(config));
    
    return configCache;
  } catch (error) {
    logger.error(`获取配置时出错: ${error.message}`);
    return {};
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
    
    // 更新配置
    await config.update(section, value, global);
    
    // 清除缓存
    configCache = null;
    
    return true;
  } catch (error) {
    logger.error(`更新配置时出错: ${error.message}`);
    return false;
  }
}

/**
 * 获取服务器列表
 * @returns {Array} - 服务器列表
 */
function getServerList() {
  try {
    const config = getConfig();
    return config.servers || [];
  } catch (error) {
    logger.error(`获取服务器列表时出错: ${error.message}`);
    return [];
  }
}

/**
 * 添加服务器
 * @param {Object} server - 服务器配置
 * @returns {Promise<boolean>} - 添加是否成功
 */
async function addServer(server) {
  try {
    if (!server || !server.name || !server.host || !server.username) {
      logger.error('服务器配置无效');
      return false;
    }
    
    // 获取当前服务器列表
    const servers = getServerList();
    
    // 检查是否已存在同名服务器
    if (servers.some(s => s.name === server.name)) {
      logger.error(`服务器名称 ${server.name} 已存在`);
      return false;
    }
    
    // 添加新服务器
    servers.push(server);
    
    // 更新配置
    return await updateConfig('servers', servers);
  } catch (error) {
    logger.error(`添加服务器时出错: ${error.message}`);
    return false;
  }
}

/**
 * 更新服务器
 * @param {string} name - 服务器名称
 * @param {Object} updatedServer - 更新后的服务器配置
 * @returns {Promise<boolean>} - 更新是否成功
 */
async function updateServer(name, updatedServer) {
  try {
    if (!name || !updatedServer) {
      logger.error('参数无效');
      return false;
    }
    
    // 获取当前服务器列表
    const servers = getServerList();
    
    // 查找服务器索引
    const index = servers.findIndex(s => s.name === name);
    
    if (index === -1) {
      logger.error(`找不到服务器 ${name}`);
      return false;
    }
    
    // 更新服务器
    servers[index] = { ...servers[index], ...updatedServer };
    
    // 更新配置
    return await updateConfig('servers', servers);
  } catch (error) {
    logger.error(`更新服务器时出错: ${error.message}`);
    return false;
  }
}

/**
 * 删除服务器
 * @param {string} name - 服务器名称
 * @returns {Promise<boolean>} - 删除是否成功
 */
async function deleteServer(name) {
  try {
    if (!name) {
      logger.error('服务器名称无效');
      return false;
    }
    
    // 获取当前服务器列表
    const servers = getServerList();
    
    // 过滤掉要删除的服务器
    const filteredServers = servers.filter(s => s.name !== name);
    
    // 检查是否找到并删除了服务器
    if (filteredServers.length === servers.length) {
      logger.error(`找不到服务器 ${name}`);
      return false;
    }
    
    // 更新配置
    return await updateConfig('servers', filteredServers);
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
 * 获取工作区命令
 * @returns {Promise<Array>} - 工作区命令列表
 */
async function getWorkspaceCommands() {
  try {
    const config = await loadWorkspaceConfig();
    return config.customCommands || [];
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
    
    // 加载工作区配置
    const config = await loadWorkspaceConfig();
    
    // 确保customCommands数组存在
    if (!config.customCommands) {
      config.customCommands = [];
    }
    
    // 添加命令
    config.customCommands.push(command);
    
    // 保存配置
    return await saveWorkspaceConfig(config);
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
    
    // 加载工作区配置
    const config = await loadWorkspaceConfig();
    
    // 确保customCommands数组存在
    if (!config.customCommands || !Array.isArray(config.customCommands)) {
      logger.error('工作区命令列表无效');
      return false;
    }
    
    // 查找命令索引
    const index = config.customCommands.findIndex(cmd => 
      cmd.command === oldCommand.command && cmd.name === oldCommand.name
    );
    
    if (index === -1) {
      logger.error('找不到要更新的命令');
      return false;
    }
    
    // 更新命令
    config.customCommands[index] = newCommand;
    
    // 保存配置
    return await saveWorkspaceConfig(config);
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
    
    // 加载工作区配置
    const config = await loadWorkspaceConfig();
    
    // 确保customCommands数组存在
    if (!config.customCommands || !Array.isArray(config.customCommands)) {
      logger.error('工作区命令列表无效');
      return false;
    }
    
    // 过滤掉要删除的命令
    const originalLength = config.customCommands.length;
    config.customCommands = config.customCommands.filter(cmd => 
      !(cmd.command === command.command && cmd.name === command.name)
    );
    
    // 检查是否找到并删除了命令
    if (config.customCommands.length === originalLength) {
      logger.error('找不到要删除的命令');
      return false;
    }
    
    // 保存配置
    return await saveWorkspaceConfig(config);
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
    
    // 获取当前自定义命令列表
    const config = getConfig();
    const commands = config.customCommands || [];
    
    // 添加命令
    commands.push(command);
    
    // 更新配置
    return await updateConfig('customCommands', commands);
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
    
    // 获取当前自定义命令列表
    const config = getConfig();
    const commands = config.customCommands || [];
    
    // 查找命令索引
    const index = commands.findIndex(cmd => 
      cmd.command === oldCommand.command && cmd.name === oldCommand.name
    );
    
    if (index === -1) {
      logger.error('找不到要更新的命令');
      return false;
    }
    
    // 更新命令
    commands[index] = newCommand;
    
    // 更新配置
    return await updateConfig('customCommands', commands);
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
    
    // 获取当前自定义命令列表
    const config = getConfig();
    const commands = config.customCommands || [];
    
    // 过滤掉要删除的命令
    const originalLength = commands.length;
    const filteredCommands = commands.filter(cmd => 
      !(cmd.command === command.command && cmd.name === command.name)
    );
    
    // 检查是否找到并删除了命令
    if (filteredCommands.length === originalLength) {
      logger.error('找不到要删除的命令');
      return false;
    }
    
    // 更新配置
    return await updateConfig('customCommands', filteredCommands);
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
}; 