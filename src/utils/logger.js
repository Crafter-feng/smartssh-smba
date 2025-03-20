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
    
    // 设置默认日志级别
    this.logLevel = LogLevel.INFO;
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
      if (data) {
        if (typeof data === 'object') {
          try {
            const dataStr = JSON.stringify(data);
            logMessage += `\n${dataStr}`;
          } catch (error) {
            logMessage += `\n[无法序列化对象: ${error.message}]`;
          }
        } else {
          logMessage += `\n${data}`;
        }
      }
      
      // 写入输出通道
      this.outputChannel.appendLine(logMessage);
    } catch (error) {
      // 避免记录日志过程中的错误导致循环
      this.outputChannel.appendLine(`[ERROR] 记录日志时出错: ${error.message}`);
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
}

// 创建日志记录器实例
const logger = new Logger();

// 从配置加载日志级别
function loadLogLevelFromConfig() {
  try {
    const config = vscode.workspace.getConfiguration('smartssh-smba');
    const level = config.get('logLevel', 'INFO');
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

module.exports = {
  logger,
  LogLevel,
};