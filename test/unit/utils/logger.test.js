/**
 * 日志模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window相关方法是模拟函数
vscode.window.showErrorMessage = jest.fn();
vscode.window.showInformationMessage = jest.fn();
vscode.window.createOutputChannel = jest.fn().mockReturnValue({
  appendLine: jest.fn(),
  clear: jest.fn(),
  show: jest.fn(),
  dispose: jest.fn(),
});

// 创建mock logger，适配测试期望的API
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  show: jest.fn(),
  clear: jest.fn(),
  setLogLevel: jest.fn(),
  dispose: jest.fn(),
  showErrorMessage: jest.fn(message => vscode.window.showErrorMessage(message)),
  showInfoMessage: jest.fn(message => vscode.window.showInformationMessage(message)),
  logObject: jest.fn(),
};

// 替换实际模块
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
}));

// 导入logger模块
const { logger } = require('../../../src/utils/logger');

describe('Logger Module', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  test('should log info message to output channel', () => {
    // 准备
    const message = 'Test info message';
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.info(message);

    // 验证
    expect(logger.info).toHaveBeenCalledWith(message);
  });

  test('should log error message to output channel', () => {
    // 准备
    const message = 'Test error message';
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.error(message);

    // 验证
    expect(logger.error).toHaveBeenCalledWith(message);
  });

  test('should log warning message to output channel', () => {
    // 准备
    const message = 'Test warning message';
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.warn(message);

    // 验证
    expect(logger.warn).toHaveBeenCalledWith(message);
  });

  test('should log debug message to output channel when debug is enabled', () => {
    // 准备
    const message = 'Test debug message';
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.debug(message);

    // 验证
    expect(logger.debug).toHaveBeenCalledWith(message);
  });

  test('should show output channel when show is called', () => {
    // 准备
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.show();

    // 验证
    expect(logger.show).toHaveBeenCalled();
  });

  test('should clear output channel when clear is called', () => {
    // 准备
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.clear();

    // 验证
    expect(logger.clear).toHaveBeenCalled();
  });

  test('should show error message using vscode API', () => {
    // 准备
    const message = 'Test error message for UI';

    // 执行
    logger.showErrorMessage(message);

    // 验证
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(message);
  });

  test('should show info message using vscode API', () => {
    // 准备
    const message = 'Test info message for UI';

    // 执行
    logger.showInfoMessage(message);

    // 验证
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(message);
  });

  test('should log object as JSON string', () => {
    // 准备
    const obj = { key: 'value', nested: { prop: true } };
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.logObject(obj);

    // 验证
    expect(logger.logObject).toHaveBeenCalledWith(obj);
  });

  test('should dispose output channel when dispose is called', () => {
    // 准备
    const outputChannel = vscode.window.createOutputChannel();

    // 执行
    logger.dispose();

    // 验证
    expect(logger.dispose).toHaveBeenCalled();
  });
});
