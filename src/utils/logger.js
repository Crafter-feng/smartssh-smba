/**
 * 日志记录工具模块
 * 处理所有与日志记录相关的功能
 */

const vscode = require('vscode');

// 日志级别
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * 日志记录器类
 */
class Logger {
  constructor() {
    // 创建输出通道
    this.outputChannel = vscode.window.createOutputChannel('SmartSSH-SMBA');

    // 设置默认日志级别为DEBUG
    this.logLevel = LogLevel.DEBUG;

    // 日志输出配置
    this._logToConsole = true;
    this._logToOutputChannel = true;
    this._logTarget = 'both';

    // 不再默认显示输出窗口，优先使用控制台输出
    // this.outputChannel.show();

    console.log('\x1b[36m%s\x1b[0m', '[SmartSSH-SMBA] 日志系统初始化完成，当前日志级别: DEBUG');
    this.debug('日志系统初始化完成，当前日志级别: DEBUG');
  }

  /**
   * 获取当前时间戳字符串
   * @returns {string} - 格式化的时间戳
   */
  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substr(0, 19);
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别名称
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据（可选）
   * @param {number} levelValue - 日志级别值
   */
  log(level, message, data = null, levelValue) {
    // 检查日志级别
    if (levelValue < this.logLevel) {
      return;
    }

    try {
      // 构建日志消息
      const timestamp = this.getTimestamp();
      let logMessage = `[${timestamp}] [${level}] ${message}`;

      // 处理附加数据
      let dataStr = '';
      if (data) {
        if (typeof data === 'object') {
          try {
            dataStr = JSON.stringify(data);
            logMessage += `\n${dataStr}`;
          } catch (error) {
            dataStr = `[无法序列化对象: ${error.message}]`;
            logMessage += `\n${dataStr}`;
          }
        } else {
          dataStr = data.toString();
          logMessage += `\n${dataStr}`;
        }
      }

      // 写入输出通道
      if (this._logToOutputChannel) {
        this.outputChannel.appendLine(logMessage);
      }

      // 输出到控制台
      if (this._logToConsole) {
        // 根据不同级别使用不同颜色输出到控制台
        const prefix = '[SmartSSH-SMBA]';
        switch (level) {
          case 'DEBUG':
            console.debug('\x1b[90m%s\x1b[0m', `${prefix} ${logMessage}`); // 灰色
            break;
          case 'INFO':
            console.info('\x1b[36m%s\x1b[0m', `${prefix} ${logMessage}`); // 青色
            break;
          case 'WARN':
            console.warn('\x1b[33m%s\x1b[0m', `${prefix} ${logMessage}`); // 黄色
            break;
          case 'ERROR':
            console.error('\x1b[31m%s\x1b[0m', `${prefix} ${logMessage}`); // 红色
            break;
          default:
            console.log(`${prefix} ${logMessage}`);
        }
      }
    } catch (error) {
      // 避免记录日志过程中的错误导致循环
      this.outputChannel.appendLine(`[ERROR] 记录日志时出错: ${error.message}`);
      console.error('\x1b[31m%s\x1b[0m', `[SmartSSH-SMBA] [ERROR] 记录日志时出错: ${error.message}`);
    }
  }

  /**
   * 记录调试级别日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据（可选）
   */
  debug(message, data = null) {
    this.log('DEBUG', message, data, LogLevel.DEBUG);
  }

  /**
   * 记录信息级别日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据（可选）
   */
  info(message, data = null) {
    this.log('INFO', message, data, LogLevel.INFO);
  }

  /**
   * 记录警告级别日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据（可选）
   */
  warn(message, data = null) {
    this.log('WARN', message, data, LogLevel.WARN);
  }

  /**
   * 记录错误级别日志
   * @param {string} message - 日志消息
   * @param {any} data - 附加数据（可选）
   */
  error(message, data = null) {
    this.log('ERROR', message, data, LogLevel.ERROR);
  }

  /**
   * 设置日志级别
   * @param {string|number} level - 日志级别名称或值
   */
  setLogLevel(level) {
    if (typeof level === 'string') {
      switch (level.toUpperCase()) {
        case 'DEBUG':
          this.logLevel = LogLevel.DEBUG;
          break;
        case 'INFO':
          this.logLevel = LogLevel.INFO;
          break;
        case 'WARN':
          this.logLevel = LogLevel.WARN;
          break;
        case 'ERROR':
          this.logLevel = LogLevel.ERROR;
          break;
        default:
          this.logLevel = LogLevel.INFO;
      }
    } else if (typeof level === 'number') {
      this.logLevel = level;
    }

    this.info(`日志级别已设置为: ${this.getLevelName(this.logLevel)}`);
  }

  /**
   * 获取当前日志级别
   * @returns {number} - 当前日志级别的值
   */
  getLogLevel() {
    return this.logLevel;
  }

  /**
   * 获取日志级别名称
   * @param {number} level - 日志级别值
   * @returns {string} - 日志级别名称
   */
  getLevelName(level) {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * 获取当前日志级别的名称
   * @returns {string} - 当前日志级别的名称
   */
  getCurrentLevelName() {
    return this.getLevelName(this.logLevel);
  }

  /**
   * 显示日志面板
   */
  show() {
    this.outputChannel.show();
  }

  /**
   * 清除日志
   */
  clear() {
    this.outputChannel.clear();
  }

  /**
   * 记录函数调用的开始
   * @param {string} funcName - 函数名称
   * @param {Object} params - 参数对象
   */
  functionStart(funcName, params = {}) {
    this.debug(`>>> 函数开始: ${funcName}`, params);
  }

  /**
   * 记录函数调用的结束
   * @param {string} funcName - 函数名称
   * @param {Object} result - 结果对象
   */
  functionEnd(funcName, result = {}) {
    this.debug(`<<< 函数结束: ${funcName}`, result);
  }

  /**
   * 设置日志输出目标
   * @param {string} target - 日志输出目标：'console', 'outputChannel', 'both', 'none'
   */
  setLogTarget(target) {
    this._logTarget = target;
    switch (target) {
      case 'console':
        this._logToConsole = true;
        this._logToOutputChannel = false;
        break;
      case 'outputChannel':
        this._logToConsole = false;
        this._logToOutputChannel = true;
        this.outputChannel.show();
        break;
      case 'both':
        this._logToConsole = true;
        this._logToOutputChannel = true;
        this.outputChannel.show();
        break;
      case 'none':
        this._logToConsole = false;
        this._logToOutputChannel = false;
        break;
      default:
        this._logToConsole = true;
        this._logToOutputChannel = true;
    }
    this.info(`日志输出目标已设置为: ${target}`);
  }
  
  /**
   * 检查日志是否启用
   * @returns {boolean} - 是否启用了日志
   */
  isEnabled() {
    return this._logToConsole || this._logToOutputChannel;
  }
  
  /**
   * 启用或禁用日志
   * @param {boolean} enabled - 是否启用日志
   */
  setEnabled(enabled) {
    if (enabled) {
      this.setLogTarget('both');
    } else {
      this.setLogTarget('none');
    }
    this.info(`日志记录已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 切换日志启用/禁用状态
   * @returns {boolean} - 切换后的启用状态
   */
  toggleLogging() {
    const currentState = this.isEnabled();
    const newState = !currentState;
    this.setEnabled(newState);
    return newState;
  }
}

// 创建日志记录器实例
const logger = new Logger();

// 从配置加载日志级别
function loadLogLevelFromConfig() {
  try {
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const level = config.get('logLevel', 'DEBUG');
    logger.setLogLevel(level);
  } catch (error) {
    logger.error(`从配置加载日志级别时出错: ${error.message}`);
  }
}

// 当扩展被激活时，设置从配置加载日志级别
vscode.workspace.onDidChangeConfiguration(event => {
  if (event.affectsConfiguration('smartssh-smba.logLevel')) {
    loadLogLevelFromConfig();
  }
});

// 初始加载
loadLogLevelFromConfig();

// 导出路径转换专用的调试日志函数
function logPathConversion(source, target, details = {}) {
  logger.debug(`路径转换: ${source} -> ${target}`, details);
}

module.exports = {
  logger,
  LogLevel,
  logPathConversion,
};
