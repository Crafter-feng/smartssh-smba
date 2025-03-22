/**
 * SSH服务模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入测试用的模拟数据
const { mockServers } = require('../../mocks/config');

// 模拟logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// 模拟configLoader
jest.mock('../../../src/adapters/config-loader', () => ({
  getServerList: jest.fn(() => [...mockServers]),
  getServerByName: jest.fn(name => {
    const server = mockServers.find(s => s.name === name);
    return server ? { ...server } : null;
  }),
}));

// 模拟path-utils
jest.mock('../../../src/utils/path-utils', () => ({
  findServerForPath: jest.fn(),
  convertLocalPathToRemote: jest.fn(),
  convertRemotePathToLocal: jest.fn(),
}));

// 模拟command-exists
jest.mock('command-exists', () => ({
  sync: jest.fn(() => true),
}));

// 获取vscode模拟 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window.showErrorMessage是一个模拟函数
vscode.window.showErrorMessage = jest.fn();

// 模拟terminal-manager
const mockTerminalManager = {
  createSshTerminal: jest.fn(server => {
    return {
      name: server.name,
      sendText: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    };
  }),
  findTerminalsByServerName: jest.fn().mockReturnValue([]),
};

jest.mock('../../../src/services/terminal-manager', () => {
  return mockTerminalManager;
});

// 导入模块
const sshService = require('../../../src/services/ssh-service');

describe('SSH Service Module', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  describe('openTerminal', () => {
    test('should open an SSH terminal', async () => {
      // 准备
      const server = mockServers[0];
      const mockTerminal = {
        show: jest.fn(),
      };

      // 模拟终端管理器行为
      mockTerminalManager.createSshTerminal.mockReturnValue(mockTerminal);

      // 执行
      const result = await sshService.openTerminal(server);

      // 验证
      expect(mockTerminalManager.createSshTerminal).toHaveBeenCalledWith(server);
      expect(mockTerminal.show).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        terminal: mockTerminal,
      });
    });

    test('should throw error if terminal creation fails', async () => {
      // 准备
      const server = mockServers[0];

      // 模拟终端管理器行为 - 创建失败
      mockTerminalManager.createSshTerminal.mockReturnValue(null);

      // 执行和验证
      await expect(sshService.openTerminal(server)).rejects.toThrow('无法创建SSH终端');
    });

    test('should throw error if server is not provided', async () => {
      // 执行和验证
      await expect(sshService.openTerminal(null)).rejects.toThrow('未指定服务器');
    });
  });

  describe('connectToServer', () => {
    test('should connect to a server by name', async () => {
      // 准备
      const serverName = mockServers[0].name;
      const mockTerminal = {
        show: jest.fn(),
      };

      // 模拟终端管理器行为
      mockTerminalManager.createSshTerminal.mockReturnValue(mockTerminal);

      // 执行
      const result = await sshService.connectToServer(serverName);

      // 验证
      expect(result).toEqual({
        success: true,
        terminal: mockTerminal,
        isNew: true
      });
    });

    test('should throw error if server name is not found', async () => {
      // 执行和验证
      await expect(sshService.connectToServer('不存在的服务器')).rejects.toThrow('未找到服务器');
    });
  });

  describe('checkSSHExecutable', () => {
    test('should return true if ssh is available', () => {
      // 模拟ssh命令存在
      require('command-exists').sync.mockReturnValue(true);

      // 执行
      const result = sshService.checkSSHExecutable();

      // 验证
      expect(result).toBe(true);
    });

    test('should return false if ssh is not available', () => {
      // 模拟ssh命令不存在
      require('command-exists').sync.mockReturnValue(false);

      // 执行
      const result = sshService.checkSSHExecutable();

      // 验证
      expect(result).toBe(false);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('未找到SSH命令')
      );
    });
  });

  describe('getServerList', () => {
    test('should return server list from config', () => {
      // 执行
      const result = sshService.getServerList();

      // 验证
      expect(result).toEqual(mockServers);
    });
  });

  describe('findServerForPath', () => {
    test('should find server for local path', () => {
      // 准备
      const localPath = 'C:\\Projects\\test1\\src\\index.js';
      
      // 模拟路径查找返回第一个服务器
      require('../../../src/utils/path-utils').findServerForPath.mockReturnValue(mockServers[0]);

      // 执行
      const result = sshService.findServerForPath(localPath);

      // 验证
      expect(result).toEqual(mockServers[0]);
    });

    test('should return null if no server matches path', () => {
      // 准备
      const localPath = 'C:\\Other\\path\\file.js';

      // 模拟路径转换器行为
      require('../../../src/utils/path-utils').findServerForPath.mockReturnValue(null);

      // 执行
      const result = sshService.findServerForPath(localPath);

      // 验证
      expect(result).toBeNull();
    });
  });
});
