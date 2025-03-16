/* eslint-disable @stylistic/comma-dangle */
const vscode = require('vscode');

/**
 * 日志级别枚举
 */
const LogLevel = {
  NONE: 0,    // 不输出任何日志
  ERROR: 1,   // 只输出错误
  WARN: 2,    // 输出警告和错误
  INFO: 3,    // 输出信息、警告和错误
  DEBUG: 4,   // 输出所有日志，包括调试信息
  TRACE: 5    // 输出所有日志，包括跟踪信息
};

/**
 * 日志输出目标枚举
 */
const LogTarget = {
  NONE: 0,           // 不输出
  CONSOLE: 1,        // 输出到控制台
  OUTPUT_CHANNEL: 2, // 输出到输出通道
  BOTH: 3            // 同时输出到控制台和输出通道
};

/**
 * 日志管理器类
 */
class Logger {
  /**
   * 创建日志管理器
   * @param {string} prefix - 日志前缀
   * @param {vscode.OutputChannel} outputChannel - VS Code 输出通道
   */
  constructor(prefix, outputChannel) {
    this.prefix = prefix || '[SmartSSH-SMBA]';
    this.outputChannel = outputChannel;
    this.logLevel = LogLevel.INFO; // 默认日志级别
    this.logTarget = LogTarget.BOTH; // 默认输出目标
    this.enabled = true; // 是否启用日志
  }

  /**
   * 设置日志级别
   * @param {number} level - 日志级别
   */
  setLogLevel(level) {
    if (level >= LogLevel.NONE && level <= LogLevel.TRACE) {
      this.logLevel = level;
      this.info(`日志级别已设置为: ${this._getLevelName(level)}`);
    } else {
      this.warn(`无效的日志级别: ${level}`);
    }
  }

  /**
   * 设置日志输出目标
   * @param {number} target - 日志输出目标
   */
  setLogTarget(target) {
    if (target >= LogTarget.NONE && target <= LogTarget.BOTH) {
      this.logTarget = target;
      this.info(`日志输出目标已设置为: ${this._getTargetName(target)}`);
    } else {
      this.warn(`无效的日志输出目标: ${target}`);
    }
  }

  /**
   * 启用日志
   */
  enable() {
    this.enabled = true;
    this.info('日志已启用');
  }

  /**
   * 禁用日志
   */
  disable() {
    this.info('日志即将禁用');
    this.enabled = false;
  }

  /**
   * 获取日志级别名称
   * @param {number} level - 日志级别
   * @returns {string} - 日志级别名称
   * @private
   */
  _getLevelName(level) {
    switch (level) {
      case LogLevel.NONE: return 'NONE';
      case LogLevel.ERROR: return 'ERROR';
      case LogLevel.WARN: return 'WARN';
      case LogLevel.INFO: return 'INFO';
      case LogLevel.DEBUG: return 'DEBUG';
      case LogLevel.TRACE: return 'TRACE';
      default: return 'UNKNOWN';
    }
  }

  /**
   * 获取日志输出目标名称
   * @param {number} target - 日志输出目标
   * @returns {string} - 日志输出目标名称
   * @private
   */
  _getTargetName(target) {
    switch (target) {
      case LogTarget.NONE: return 'NONE';
      case LogTarget.CONSOLE: return 'CONSOLE';
      case LogTarget.OUTPUT_CHANNEL: return 'OUTPUT_CHANNEL';
      case LogTarget.BOTH: return 'BOTH';
      default: return 'UNKNOWN';
    }
  }

  /**
   * 记录日志
   * @param {number} level - 日志级别
   * @param {string} levelName - 日志级别名称
   * @param {string} message - 日志消息
   * @param {any[]} args - 附加参数
   * @private
   */
  _log(level, levelName, message, ...args) {
    if (!this.enabled || level > this.logLevel || this.logTarget === LogTarget.NONE) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `${this.prefix} [${timestamp}] [${levelName}] ${message}`;

    // 输出到控制台
    if (this.logTarget === LogTarget.CONSOLE || this.logTarget === LogTarget.BOTH) {
      if (level === LogLevel.ERROR) {
        console.error(formattedMessage, ...args);
      } else if (level === LogLevel.WARN) {
        console.warn(formattedMessage, ...args);
      } else if (level === LogLevel.INFO) {
        console.info(formattedMessage, ...args);
      } else {
        console.info(formattedMessage, ...args);
      }
    }

    // 输出到输出通道
    if (this.outputChannel && (this.logTarget === LogTarget.OUTPUT_CHANNEL || this.logTarget === LogTarget.BOTH)) {
      let outputMessage = formattedMessage;

      // 处理附加参数
      if (args.length > 0) {
        args.forEach(arg => {
          if (typeof arg === 'object') {
            try {
              outputMessage += ' ' + JSON.stringify(arg);
            } catch (e) {
              outputMessage += ' [Object]';
            }
          } else {
            outputMessage += ' ' + arg;
          }
        });
      }

      this.outputChannel.appendLine(outputMessage);
    }
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {...any} args - 附加参数
   */
  error(message, ...args) {
    this._log(LogLevel.ERROR, 'ERROR', message, ...args);
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {...any} args - 附加参数
   */
  warn(message, ...args) {
    this._log(LogLevel.WARN, 'WARN', message, ...args);
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {...any} args - 附加参数
   */
  info(message, ...args) {
    this._log(LogLevel.INFO, 'INFO', message, ...args);
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {...any} args - 附加参数
   */
  debug(message, ...args) {
    this._log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }

  /**
   * 记录跟踪日志
   * @param {string} message - 日志消息
   * @param {...any} args - 附加参数
   */
  trace(message, ...args) {
    this._log(LogLevel.TRACE, 'TRACE', message, ...args);
  }

  /**
   * 记录函数调用开始
   * @param {string} funcName - 函数名称
   * @param {Object} params - 函数参数
   */
  functionStart(funcName, params = {}) {
    if (this.enabled && this.logLevel >= LogLevel.TRACE) {
      this.trace(`开始执行函数: ${funcName}`, params);
    }
  }

  /**
   * 记录函数调用结束
   * @param {string} funcName - 函数名称
   * @param {Object} result - 函数返回值
   */
  functionEnd(funcName, result = {}) {
    if (this.enabled && this.logLevel >= LogLevel.TRACE) {
      this.trace(`函数执行完成: ${funcName}`, result);
    }
  }

  /**
   * 记录性能计时开始
   * @param {string} label - 计时标签
   */
  timeStart(label) {
    if (this.enabled && this.logLevel >= LogLevel.DEBUG) {
      console.time(`${this.prefix} ${label}`);
      this.debug(`性能计时开始: ${label}`);
    }
  }

  /**
   * 记录性能计时结束
   * @param {string} label - 计时标签
   */
  timeEnd(label) {
    if (this.enabled && this.logLevel >= LogLevel.DEBUG) {
      console.timeEnd(`${this.prefix} ${label}`);
      this.debug(`性能计时结束: ${label}`);
    }
  }
}

// 创建全局单例日志实例
const outputChannel = vscode.window.createOutputChannel('SmartSSH-SMBA');
const logger = new Logger('[SmartSSH-SMBA]', outputChannel);

// 导出日志级别、目标枚举和单例日志实例
module.exports = {
  logger,
  LogLevel,
  LogTarget
}; 