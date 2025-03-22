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
            remotePath: '/home/user/project space\'s' // 包含空格和单引号的路径
          }
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证 - 确保路径被正确引用和转义
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("cd '/home/user/project space'\\''s'");
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
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("cd '/home/user/project$path'\\''with\"many&special#chars'");
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
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("cd '/home/user/simple path'");
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
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain('echo "Hello World";');
      expect(commandStr).toContain('ls -la;');
      expect(commandStr).toContain('pwd;');
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
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("eval $(echo '$SHELL') --login;");
    });
  });

  describe('错误处理', () => {
    test('处理无效服务器配置应返回默认值', () => {
      // 准备 - 传入null服务器
      const server = null;

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
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
        ],
        initCommands: [
          'echo "Connected to production server"',
          'source ~/.bashrc'
        ]
      };

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result.command).toBe('ssh');
      expect(result.args).toContain('linuxuser@linux.example.com');
      expect(result.args).toContain('-i');
      expect(result.args).toContain('/home/user/.ssh/id_rsa');
      
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("cd '/var/www/html'");
      expect(commandStr).toContain('echo "Connected to production server"');
      expect(commandStr).toContain('source ~/.bashrc');
      expect(commandStr).toContain("eval $(echo '$SHELL') --login");
    });

    test('应正确构建路径C:\\ProgramFiles\\github\\c_converter测试用例', () => {
      // 准备 - 模拟从问题中提取的场景
      const server = {
        name: '问题场景服务器',
        host: '100.101.25.89',
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
      const commandStr = result.args[result.args.length - 1];
      expect(commandStr).toContain("cd '/home/root'");
      
      // 完整命令验证
      const fullCommand = `${result.command} ${result.args.join(' ')}`;
      expect(fullCommand).toMatch(/ssh root@100\.101\.25\.89 -t cd '\/home\/root'.*eval \$\(echo '\$SHELL'\) --login/);
    });

    test('应正确处理从mockServers配置构建命令', () => {
      // 使用第一个mock服务器配置
      const server = mockServers[0];

      // 执行
      const result = terminalManager.buildSshCommand(server);

      // 验证
      expect(result.command).toBe('ssh');
      expect(result.args).toContain(`${server.username}@${server.host}`);
      
      const commandStr = result.args[result.args.length - 1];
      // 检查路径转换
      expect(commandStr).toContain(`cd '${server.pathMappings[0].remotePath}'`);
      
      // 检查初始化命令
      server.initCommands.forEach(cmd => {
        expect(commandStr).toContain(`${cmd};`);
      });
    });
  });
}); 