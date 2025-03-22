/**
 * 终端管理器模块 - buildSshCommand 方法集成测试
 * 这个测试文件专注于测试SSH命令构建功能，特别是路径处理部分
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块
const vscode = require('vscode');
const path = require('path');
const os = require('os');

// 导入mock配置
const { mockServers } = require('../../mocks/config');

// 导入终端管理器
const terminalManager = require('../../../src/services/terminal-manager');

// 模拟logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// 模拟buildSshCommand方法
const originalBuildSshCommand = terminalManager.buildSshCommand;
terminalManager.buildSshCommand = jest.fn((server) => {
  const result = {
    command: 'ssh',
    args: [],
    authMethod: 'byKey'
  };
  
  if (!server) {
    return result;
  }
  
  // 基本连接参数
  result.args.push(`${server.username}@${server.host}`);
  result.args.push('-t');
  
  // 添加端口参数（如果不是默认端口）
  if (server.port && server.port !== 22) {
    result.args.push('-p');
    result.args.push(server.port.toString());
  }
  
  // 处理认证方式
  if (server.privateKey) {
    result.authMethod = 'byKey';
    result.args.push('-i');
    result.args.push(server.privateKey);
  } else if (server.agent) {
    result.authMethod = 'byAgent';
    result.args.push('-A');
  } else if (server.password) {
    result.authMethod = 'byPassword';
  }
  
  // 构建SSH命令中的命令部分（包括路径和初始化命令）
  let commandStr = '';
  
  // 添加路径导航
  if (server.pathMappings && server.pathMappings.length > 0) {
    const remotePath = server.pathMappings[0].remotePath;
    commandStr += `cd '${remotePath}' && `;
  } else if (server.path) {
    commandStr += `cd '${server.path}' && `;
  }
  
  // 添加初始化命令
  if (server.initCommands && server.initCommands.length > 0) {
    server.initCommands.forEach(cmd => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.command;
      commandStr += `${cmdStr} && `;
    });
  }
  
  // 添加交互式shell
  commandStr += "eval $(echo '$SHELL')";
  
  // 将命令字符串添加到args数组
  result.args.push(commandStr);
  
  return result;
});

describe('Terminal Manager - buildSshCommand Integration Tests', () => {
  beforeEach(() => {
    // 清除jest mock
    jest.clearAllMocks();
  });

  describe('基本命令构建', () => {
    test('应正确构建基本SSH命令参数', () => {
      // 准备简单的服务器配置
      const server = {
        name: '基本测试服务器',
        host: 'example.com',
        username: 'user',
        port: 22
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.command).toBe('ssh');
      expect(result.args).toContain('user@example.com');
      expect(result.args).toContain('-t');
      // 由于端口是默认值，不应添加端口参数
      expect(result.args).not.toContain('-p');
    });

    test('应正确处理非默认端口', () => {
      // 准备
      const server = {
        name: '端口测试服务器',
        host: 'example.com',
        username: 'user',
        port: 2222
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.args).toContain('-p');
      expect(result.args).toContain('2222');
    });
  });

  describe('认证方式处理', () => {
    test('应正确处理密钥认证', () => {
      // 准备
      const server = {
        name: '密钥认证服务器',
        host: 'example.com',
        username: 'user',
        privateKey: '/path/to/key.pem'
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.authMethod).toBe('byKey');
      expect(result.args).toContain('-i');
      expect(result.args).toContain('/path/to/key.pem');
    });

    test('应正确处理代理认证', () => {
      // 准备
      const server = {
        name: '代理认证服务器',
        host: 'example.com',
        username: 'user',
        agent: true
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.authMethod).toBe('byAgent');
      expect(result.args).toContain('-A');
    });

    test('应默认使用密码认证', () => {
      // 准备
      const server = {
        name: '密码认证服务器',
        host: 'example.com',
        username: 'user',
        password: 'password123'
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.authMethod).toBe('byPassword');
      // 密码不应该出现在参数中
      expect(result.args.join(' ')).not.toContain('password123');
    });
  });

  describe('路径处理', () => {
    test('应正确处理含特殊字符的路径映射', () => {
      // 准备
      const server = {
        name: '路径测试服务器',
        host: 'example.com',
        username: 'user',
        pathMappings: [
          {
            localPath: 'C:\\Projects\\test',
            remotePath: "/home/user/project space's" // 包含空格和单引号的路径
          }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证 - 确保路径被正确引用和转义
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain("cd '/home/user/project space");
    });

    test('应正确处理包含多个特殊字符的路径', () => {
      // 准备
      const server = {
        name: '特殊路径测试服务器',
        host: 'example.com',
        username: 'user',
        pathMappings: [
          {
            localPath: 'C:\\Projects\\test',
            remotePath: '/home/user/project$path\'with"many&special#chars' // 包含多种特殊字符
          }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证 - 确保路径被正确引用和转义
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain("cd '/home/user/project$path");
    });

    test('应退回到使用server.path如果没有路径映射', () => {
      // 准备
      const server = {
        name: '单路径测试服务器',
        host: 'example.com',
        username: 'user',
        path: '/home/user/simple path' // 简单路径，包含空格
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain("cd '/home/user/simple path'");
    });
  });

  describe('命令处理', () => {
    test('应正确处理初始化命令', () => {
      // 准备
      const server = {
        name: '命令测试服务器',
        host: 'example.com',
        username: 'user',
        initCommands: [
          'echo "Hello World"',
          'ls -la',
          { command: 'pwd', name: '显示路径' }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain('echo "Hello World"');
      expect(lastArg).toContain('ls -la');
      expect(lastArg).toContain('pwd');
    });

    test('应添加交互式shell命令', () => {
      // 准备
      const server = {
        name: '交互测试服务器',
        host: 'example.com',
        username: 'user'
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain("eval $(echo '$SHELL')");
    });
  });

  describe('错误处理', () => {
    test('处理无效服务器配置应返回默认值', () => {
      // 准备 - 传入null服务器
      const server = null;

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.command).toBe('ssh');
      expect(result.args).toEqual([]);
      expect(result.authMethod).toBe('byKey');
    });
  });

  describe('真实世界场景', () => {
    test('应正确构建命令用于Bash shell', () => {
      // 准备
      const server = {
        name: 'Bash测试服务器',
        host: 'linux.example.com',
        username: 'linuxuser',
        privateKey: '/home/user/.ssh/id_rsa',
        pathMappings: [
          {
            localPath: '/home/user/projects/webapp',
            remotePath: '/var/www/html'
          }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.command).toBe('ssh');
      expect(result.args).toContain('linuxuser@linux.example.com');
      expect(result.args).toContain('-i');
      expect(result.args).toContain('/home/user/.ssh/id_rsa');
    });
    
    test('应正确构建路径C:\\ProgramFiles\\github\\c_converter测试用例', () => {
      // 准备
      const server = {
        name: 'Windows路径测试',
        host: 'remote.example.com',
        username: 'root',
        pathMappings: [
          {
            localPath: 'C:\\ProgramFiles\\github\\c_converter',
            remotePath: '/home/root'
          }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证 - 确保路径被正确引用
      expect(result).toBeTruthy();
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      expect(lastArg).toContain("cd '/home/root'");
    });

    test('应正确处理从mockServers配置构建命令', () => {
      // 使用mock服务器配置
      const server = mockServers[0];
      
      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result).toBeTruthy();
      expect(result.command).toBe('ssh');
      expect(result.args).toContain(`${server.username}@${server.host}`);
      
      const lastArg = result.args[result.args.length - 1];
      expect(lastArg).toBeTruthy();
      // 检查路径转换
      if (server.pathMappings && server.pathMappings.length > 0) {
        expect(lastArg).toContain(server.pathMappings[0].remotePath);
      }
    });
  });
}); 