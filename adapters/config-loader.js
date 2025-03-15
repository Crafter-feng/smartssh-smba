const path = require('path');
const homedir = require('os').homedir();
const fs = require('fs');
const vscode = require('vscode');

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

// 启动监视器
config.startWatchers = function () {
  var _this = this;
  Object.keys(this.supported_configs).forEach(configname => {
    var adapter = _this.supported_configs[configname];
    if (!adapter.codesettings) {
      if (_this.exists(adapter.filename)) {
        _this.watcher.add(_this.getUserSettingsLocation(adapter.filename));
      }
    }
  });
};

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
      customCommands: [...(globalConfig.customCommands || []), ...(workspaceConfig.customCommands || [])],
    };
    
    console.log(`[SmartSSH-SMBA] 配置加载完成，服务器数量: ${integratedConfig.serverList ? integratedConfig.serverList.length : 0}`);
    return integratedConfig;
  } catch (error) {
    console.error('[SmartSSH-SMBA] 加载配置时出错:', error);
    // 返回默认配置
    return {
      showHostsInPickLists: false,
      serverList: [],
      customCommands: [],
    };
  }
}

/**
 * 保存配置
 * @param {Object} configData - 配置数据
 * @param {boolean} saveToWorkspace - 是否保存到工作区配置，默认为false（保存到全局配置）
 */
async function saveConfig(configData, saveToWorkspace = false) {
  try {
    console.log('[SmartSSH-SMBA] 正在保存配置...');
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const target = saveToWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update('config', configData, target);
    console.log('[SmartSSH-SMBA] 配置保存完成');
  } catch (error) {
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
 * 启动配置文件监视器
 * @returns {vscode.Disposable} 配置变更事件的处置对象
 */
function startWatchers() {
  try {
    // 监视 VS Code 配置变更
    return vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('smartssh-smba.config')) {
        // 如果配置发生变化，触发回调
        if (typeof configChangeCallback === 'function') {
          configChangeCallback();
        }
      }
    });
  } catch (error) {
    console.error('启动配置监视器时出错:', error);
    return { dispose: () => {} }; // 返回一个空的可处置对象
  }
}

/**
 * 设置监视回调
 * @param {Function} callback - 回调函数
 */
function setWatcherCallback(callback) {
  configChangeCallback = callback;
}

module.exports = {
  loadConfig,
  saveConfig,
  getServerList,
  getCustomCommands,
  updateServerList,
  updateCustomCommands,
  startWatchers,
  setWatcherCallback
};
