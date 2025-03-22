/**
 * 状态栏模块
 * 管理VS Code状态栏上的扩展按钮
 */

const vscode = require('vscode');
const { logger } = require('../utils/logger');
const terminalManager = require('../services/terminal-manager');

// 状态栏按钮
let fastOpenConnectionButton = null;
// 状态更新器
let statusUpdateInterval = null;
// 更新节流控制
let updatePending = false;
// 上次状态
let lastConnectionState = {
  connected: false,
  serverNames: ''
};

/**
 * 初始化状态栏
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function initialize(context) {
  try {
    // 创建状态栏按钮
    fastOpenConnectionButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    fastOpenConnectionButton.command = 'smartssh-smba.fastOpenConnection';
    fastOpenConnectionButton.text = '$(terminal) 连接 SSH';
    fastOpenConnectionButton.tooltip = '打开 SSH 连接';
    fastOpenConnectionButton.show();

    // 将状态栏按钮添加到上下文处置列表
    context.subscriptions.push(fastOpenConnectionButton);

    // 监听终端事件
    registerEventListeners(context);

    // 设置定期检查状态的计时器 (每30秒检查一次作为备份)
    startStatusUpdateTimer();

    // 记录日志
    logger.debug('状态栏已初始化');

    // 更新状态栏按钮
    updateStatusBarButton(true);
  } catch (error) {
    logger.error(`初始化状态栏时出错: ${error.message}`);
  }
}

/**
 * 开始状态更新计时器
 * 定期检查SSH连接状态
 */
function startStatusUpdateTimer() {
  // 清除现有的计时器
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval);
  }

  // 每30秒检查一次状态（频率降低，作为备份机制）
  statusUpdateInterval = setInterval(() => {
    // 使用延迟调用以避免状态更新过于频繁
    if (!updatePending) {
      updatePending = true;
      setTimeout(() => {
        updateStatusBarButton(false); // 传入false表示这是定时更新，除非状态改变，否则不记录日志
        updatePending = false;
      }, 100);
    }
  }, 30000); // 从5秒改为30秒
}

/**
 * 防抖函数 - 确保在短时间内多次调用时只执行最后一次
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 防抖后的函数
 */
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

// 创建防抖版本的状态栏更新函数
const debouncedUpdateStatusBar = debounce((verbose) => {
  updateStatusBarButton(verbose);
}, 300);

/**
 * 注册事件监听器
 * @param {vscode.ExtensionContext} context - 扩展上下文
 */
function registerEventListeners(context) {
  // 监听终端创建事件
  const onDidOpenTerminal = vscode.window.onDidOpenTerminal(() => {
    logger.debug('终端创建事件: 更新状态栏');
    // 使用防抖版本的更新函数
    debouncedUpdateStatusBar(true);
  });

  // 监听终端关闭事件
  const onDidCloseTerminal = vscode.window.onDidCloseTerminal(() => {
    logger.debug('终端关闭事件: 更新状态栏');
    // 使用防抖版本的更新函数
    debouncedUpdateStatusBar(true);
  });

  // 监听终端管理器的SSH连接状态变化
  terminalManager.onTerminalCreated(() => {
    logger.debug('SSH终端创建事件: 更新状态栏');
    updateStatusBarButton(true);
  });

  terminalManager.onTerminalClosed(() => {
    logger.debug('SSH终端关闭事件: 更新状态栏');
    updateStatusBarButton(true);
  });

  // 监听活动编辑器变化，这可能影响服务器关联
  const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
    // 使用防抖版本的更新函数，不输出日志
    debouncedUpdateStatusBar(false);
  });

  // 添加到处置列表
  context.subscriptions.push(onDidOpenTerminal);
  context.subscriptions.push(onDidCloseTerminal);
  context.subscriptions.push(onDidChangeActiveTextEditor);
}

/**
 * 更新状态栏按钮
 * 根据不同状态调整按钮显示
 * @param {boolean} verbose - 是否输出详细日志，默认为true
 */
function updateStatusBarButton(verbose = true) {
  try {
    if (!fastOpenConnectionButton) {
      return;
    }

    // 检查是否有活动的SSH连接
    const activeSSHTerminals = terminalManager.getAllSSHTerminals();
    const hasActiveSSHConnections = activeSSHTerminals && activeSSHTerminals.length > 0;
    const serverNames = hasActiveSSHConnections 
      ? activeSSHTerminals.map(term => term.serverName || '未命名').join(', ')
      : '';

    // 检查状态是否变化
    const stateChanged = 
      lastConnectionState.connected !== hasActiveSSHConnections || 
      lastConnectionState.serverNames !== serverNames;

    // 更新上次状态
    lastConnectionState.connected = hasActiveSSHConnections;
    lastConnectionState.serverNames = serverNames;

    // 只有当状态变化或要求详细日志时才输出日志
    const shouldLog = verbose || stateChanged;

    if (hasActiveSSHConnections) {
      // 有活动的SSH连接时
      fastOpenConnectionButton.text = `${serverNames} SSH 已连接`;
      fastOpenConnectionButton.tooltip = `已连接到服务器: ${serverNames}`;
      
      if (shouldLog) {
        logger.debug(`状态栏更新: 已连接SSH (${serverNames})`);
      }
    } else {
      // 无活动SSH连接时
      fastOpenConnectionButton.text = ' 连接 SSH';
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      
      if (shouldLog) {
        logger.debug('状态栏更新: 未连接SSH');
      }
    }

    // 显示按钮
    fastOpenConnectionButton.show();
  } catch (error) {
    logger.error(`更新状态栏按钮时出错: ${error.message}`);
    // 发生错误时设置为默认文本
    if (fastOpenConnectionButton) {
      fastOpenConnectionButton.text = '连接 SSH';
      fastOpenConnectionButton.tooltip = '打开 SSH 连接';
      fastOpenConnectionButton.show();
    }
  }
}

/**
 * 清理状态栏资源
 */
function dispose() {
  try {
    // 清除更新计时器
    if (statusUpdateInterval) {
      clearInterval(statusUpdateInterval);
      statusUpdateInterval = null;
    }

    // 处置状态栏按钮
    if (fastOpenConnectionButton) {
      fastOpenConnectionButton.dispose();
      fastOpenConnectionButton = null;
    }

    logger.debug('状态栏资源已清理');
  } catch (error) {
    logger.error(`清理状态栏资源时出错: ${error.message}`);
  }
}

module.exports = {
  initialize,
  updateStatusBarButton,
  dispose
};
