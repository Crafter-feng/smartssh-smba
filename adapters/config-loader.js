/* eslint-disable @stylistic/comma-dangle */
const path = require('path');
const homedir = require('os').homedir();
const fs = require('fs');
const vscode = require('vscode');

// 添加缓存机制
let configCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 1000; // 1秒缓存有效期

// 创建配置对象
const config = {};

// 路径连接函数
var pathjoin = (function (_super) {
  return function () {
    return path.normalize(_super.apply(this, arguments)).replace(/\\/g, '/');
  };
})(path.join);

// 支持的配置
config.supported_configs = {
  'smartssh-smba': require('./configs/smartssh-smba-config'),
};

// 配置变更回调
let configChangeCallback = null;

/**
 * 启动配置文件监视器
 * @returns {vscode.Disposable} 配置变更事件的处置对象
 * @deprecated 使用 vscode.workspace.onDidChangeConfiguration 代替
 */
function startWatchers() {
  console.log('[SmartSSH-SMBA] 配置监视器已弃用，请使用 vscode.workspace.onDidChangeConfiguration');
  return { dispose: () => { } }; // 返回一个空的可处置对象
}

// 获取用户设置位置
config.getUserSettingsLocation = function (filename) {
  var folder = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.platform == 'linux' ? pathjoin(homedir, '.config') : '/var/local');
  if (/^[A-Z]:[/\\]/.test(folder)) folder = folder.substring(0, 1).toLowerCase() + folder.substring(1);
  return pathjoin(folder, '/Code/User/', filename ? filename : '');
};

// 检查文件是否存在
config.exists = function (filename, local = false) {
  var result = true;
  if (fs.accessSync) {
    try {
      fs.accessSync(
        (!local) ? this.getUserSettingsLocation(filename) : filename
      );
    } catch (e) {
      result = false;
    }
  } else {
    result = fs.existsSync(
      (!local) ? this.getUserSettingsLocation(filename) : filename
    );
  }
  return result;
};

// 获取配置内容
config.getConfigContents = function () {
  var _this = this;
  var merged_configs = [];
  var messages = [];
  Object.keys(this.supported_configs).forEach(configname => {
    var adapter = _this.supported_configs[configname];
    if (!adapter.codesettings) {
      if (_this.exists(adapter.filename)) {
        var filepath = _this.getUserSettingsLocation(adapter.filename);
        var content = fs.readFileSync(filepath).toString();
        var { result, configs } = adapter.formatter(content);
      } else {
        messages.push('配置文件 "' + _this.getUserSettingsLocation(adapter.filename) + '" 不存在，已跳过。');
        return;
      }
    } else {
      // eslint-disable-next-line no-redeclare
      var { result, configs } = adapter.formatter();
    }
    if (result) {
      merged_configs = merged_configs.concat(configs);
      messages.push('从 "' + (!adapter.codesettings ? _this.getUserSettingsLocation(adapter.filename) : adapter.filename) + '" 加载了 ' + configs.length + ' 个服务器');
    } else {
      messages.push('配置文件 "' + _this.getUserSettingsLocation(adapter.filename) + '" 已损坏，已跳过。');
    }
  });
  return { merged_configs, messages };
};

/**
 * 加载配置
 * @returns {Object} 配置对象
 */
function loadConfig() {
  const now = Date.now();
  if (configCache && (now - lastLoadTime < CACHE_TTL)) {
    return configCache;
  }
  try {
    console.log('[SmartSSH-SMBA] 正在加载配置...');
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

    // 合并配置
    const integratedConfig = {
      showHostsInPickLists: workspaceConfig.showHostsInPickLists || globalConfig.showHostsInPickLists || false,
      serverList: [...(globalConfig.serverList || []), ...(workspaceConfig.serverList || [])],
      // 确保全局命令不包含工作区标识
      customCommands: (globalConfig.customCommands || []).map(cmd => ({
        ...cmd,
        isWorkspaceCommand: false
      })),
      // 添加工作区标识到工作区命令
      workspaceCommands: (workspaceConfig.customCommands || []).map(cmd => ({
        ...cmd,
        isWorkspaceCommand: true,
        workspaceName: vscode.workspace.name || '当前工作区'
      }))
    };

    console.log(`[SmartSSH-SMBA] 配置加载完成，服务器数量: ${integratedConfig.serverList ? integratedConfig.serverList.length : 0}`);

    // 更新缓存和时间戳
    configCache = integratedConfig;
    lastLoadTime = now;

    return integratedConfig;
  } catch (error) {
    console.error('[SmartSSH-SMBA] 加载配置时出错:', error);
    // 返回默认配置
    return {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
      workspaceCommands: []
    };
  }
}

/**
 * 清除配置缓存
 */
function clearConfigCache() {
  configCache = null;
}

/**
 * 保存配置
 * @param {Object} configData - 配置数据
 * @param {boolean} saveToWorkspace - 是否保存到工作区配置，默认为false（保存到全局配置）
 */
async function saveConfig(configData, saveToWorkspace = false) {
  try {
    console.log('[SmartSSH-SMBA] 正在保存配置...');

    // 清除缓存，确保下次加载时获取最新配置
    clearConfigCache();

    // 设置一个标志，表示我们正在保存配置
    global._smartsshSavingConfig = true;

    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const target = saveToWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update('config', configData, target);

    // 延迟清除标志，以便事件处理完成
    setTimeout(() => {
      global._smartsshSavingConfig = false;
    }, 100);

    console.log('[SmartSSH-SMBA] 配置保存完成');
  } catch (error) {
    global._smartsshSavingConfig = false;
    console.error('[SmartSSH-SMBA] 保存配置时出错:', error);
    throw error;
  }
}

/**
 * 获取服务器列表
 * @returns {Array} 服务器列表
 */
function getServerList() {
  const configData = loadConfig();
  return configData.serverList || [];
}

/**
 * 获取自定义命令列表
 * @returns {Array} 自定义命令列表
 */
function getCustomCommands() {
  const configData = loadConfig();
  return configData.customCommands || [];
}

/**
 * 获取工作区命令列表
 * @returns {Array} 工作区命令列表
 */
function getWorkspaceCommands() {
  const configData = loadConfig();
  return configData.workspaceCommands || [];
}

/**
 * 更新服务器列表
 * @param {Array} serverList - 服务器列表
 * @param {boolean} saveToWorkspace - 是否保存到工作区配置，默认为false（保存到全局配置）
 */
async function updateServerList(serverList, saveToWorkspace = false) {
  const configData = loadConfig();
  configData.serverList = serverList;
  await saveConfig(configData, saveToWorkspace);
}

/**
 * 更新自定义命令列表
 * @param {Array} customCommands - 自定义命令列表
 * @param {boolean} saveToWorkspace - 是否保存到工作区配置，默认为false（保存到全局配置）
 */
async function updateCustomCommands(customCommands, saveToWorkspace = false) {
  const configData = loadConfig();
  configData.customCommands = customCommands;
  await saveConfig(configData, saveToWorkspace);
}

/**
 * 更新工作区命令列表
 * @param {Array} commands - 命令列表
 */
async function updateWorkspaceCommands(commands) {
  try {
    // 获取当前工作区配置
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const workspaceConfig = config.inspect('config').workspaceValue || {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };

    // 更新工作区命令
    workspaceConfig.customCommands = commands.map(cmd => {
      // 移除工作区特定属性
      const { isWorkspaceCommand, workspaceName, ...cleanCmd } = cmd;
      return cleanCmd;
    });

    // 保存到工作区配置
    await config.update('config', workspaceConfig, vscode.ConfigurationTarget.Workspace);
    console.log('[SmartSSH-SMBA] 工作区命令已更新');
  } catch (error) {
    console.error('[SmartSSH-SMBA] 更新工作区命令时出错:', error);
    throw error;
  }
}

/**
 * 设置监视回调
 * @param {Function} callback - 回调函数
 * @deprecated 使用 vscode.workspace.onDidChangeConfiguration 代替
 */
function setWatcherCallback(callback) {
  console.log('[SmartSSH-SMBA] 配置监视回调已弃用，请使用 vscode.workspace.onDidChangeConfiguration');
  // 不执行任何操作
}

module.exports = {
  loadConfig,
  saveConfig,
  getServerList,
  getCustomCommands,
  getWorkspaceCommands,
  updateServerList,
  updateCustomCommands,
  updateWorkspaceCommands,
  startWatchers,
  setWatcherCallback,
  clearConfigCache
};
