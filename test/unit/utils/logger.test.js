/**
 * 日志工具模块单元测试
 */
const vscode = require('../../mocks/vscode');
const path = require('path');

// 在导入logger之前先模拟vscode API
jest.mock('vscode', () => vscode);

// 导入logger模块
const { logger } = require('../../../src/utils/logger');

describe('Logger Module', () => {
  let outputChannel;

  beforeEach(() => {
    // 重置vscode mock
    jest.clearAllMocks();
    
    // 创建一个新的输出通道
    outputChannel = vscode.window.createOutputChannel('SmartSSH-SMBA');
    
    // 初始化logger
    logger.setLogTarget('output');
    logger.setLogLevel('debug');
    logger.toggleLogging(true);
  });

  test('should log debug messages when log level is debug', () => {
    // 执行
    logger.debug('Test debug message');
    
    // 验证
    expect(outputChannel.content).toContain('[DEBUG] Test debug message');
  });

  test('should log info messages', () => {
    // 执行
    logger.info('Test info message');
    
    // 验证
    expect(outputChannel.content).toContain('[INFO] Test info message');
  });

  test('should log warning messages', () => {
    // 执行
    logger.warn('Test warning message');
    
    // 验证
    expect(outputChannel.content).toContain('[WARN] Test warning message');
  });

  test('should log error messages', () => {
    // 执行
    logger.error('Test error message');
    
    // 验证
    expect(outputChannel.content).toContain('[ERROR] Test error message');
  });

  test('should not log debug messages when log level is info', () => {
    // 设置日志级别
    logger.setLogLevel('info');
    
    // 执行
    logger.debug('Test debug message');
    
    // 验证
    expect(outputChannel.content).not.toContain('[DEBUG] Test debug message');
  });

  test('should not log any messages when logging is disabled', () => {
    // 禁用日志
    logger.toggleLogging(false);
    
    // 执行
    logger.info('Test info message');
    
    // 验证
    expect(outputChannel.content).toBe('');
  });

  test('should log to console when log target is console', () => {
    // 模拟console
    const originalConsoleLog = console.log;
    const mockConsoleLog = jest.fn();
    console.log = mockConsoleLog;
    
    // 设置日志目标
    logger.setLogTarget('console');
    
    // 执行
    logger.info('Test console message');
    
    // 验证
    expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('[INFO] Test console message'));
    
    // 恢复console
    console.log = originalConsoleLog;
  });

  test('should format objects and arrays correctly', () => {
    // 执行
    logger.info('Test object:', { key: 'value' });
    logger.info('Test array:', [1, 2, 3]);
    
    // 验证
    expect(outputChannel.content).toContain('[INFO] Test object: {"key":"value"}');
    expect(outputChannel.content).toContain('[INFO] Test array: [1,2,3]');
  });

  test('should handle errors in objects', () => {
    // 创建一个带有循环引用的对象
    const circularObj = {};
    circularObj.self = circularObj;
    
    // 执行
    logger.info('Test circular reference:', circularObj);
    
    // 验证
    expect(outputChannel.content).toContain('[INFO] Test circular reference:');
    expect(outputChannel.content).toContain('[Circular]');
  });
}); 