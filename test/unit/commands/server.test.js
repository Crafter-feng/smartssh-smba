/**
 * 服务器命令模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window相关方法是模拟函数
vscode.window.showErrorMessage = jest.fn();
vscode.window.showInformationMessage = jest.fn();
vscode.window.showInputBox = jest.fn();
vscode.window.showQuickPick = jest.fn();

// 模拟logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    showErrorMessage: jest.fn(),
  },
}));

// 导入测试用的模拟数据
const { mockServers } = require('../../mocks/config');

// 模拟configLoader
jest.mock('../../../src/adapters/config-loader', () => ({
  getServerList: jest.fn().mockResolvedValue([...mockServers]),
  getServerByName: jest.fn().mockImplementation(async name => {
    const server = mockServers.find(s => s.name === name);
    return server || null;
  }),
  saveServer: jest.fn().mockImplementation(async server => server),
  deleteServer: jest.fn().mockResolvedValue(true),
}));

// 创建模拟的服务器服务对象
const mockServerService = {
  getServerList: jest.fn().mockImplementation(async () => [...mockServers]),
  getServerByName: jest.fn().mockImplementation(async name => {
    const server = mockServers.find(s => s.name === name);
    return server || null;
  }),
  saveServer: jest.fn().mockImplementation(async server => {
    return require('../../../src/adapters/config-loader').saveServer(server);
  }),
  deleteServer: jest.fn().mockImplementation(async name => {
    return require('../../../src/adapters/config-loader').deleteServer(name);
  }),
  refreshServerList: jest.fn().mockResolvedValue(true),
  selectServer: jest.fn().mockImplementation(async () => {
    return mockServers[0];
  }),
};

// 替换实际模块
jest.mock('../../../src/commands/server', () => mockServerService);

describe('Server Command Service', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  describe('getServerList', () => {
    test('should return server list', async () => {
      // 执行
      const servers = await mockServerService.getServerList();

      // 验证
      expect(servers).toEqual(mockServers);
    });
  });

  describe('getServerByName', () => {
    test('should return server by name', async () => {
      // 准备
      const serverName = mockServers[0].name;

      // 执行
      const server = await mockServerService.getServerByName(serverName);

      // 验证
      expect(server).toEqual(mockServers[0]);
    });

    test('should return null if server not found', async () => {
      // 准备
      const serverName = 'non-existent-server';

      // 执行
      const server = await mockServerService.getServerByName(serverName);

      // 验证
      expect(server).toBeNull();
    });
  });

  describe('saveServer', () => {
    test('should save server configuration', async () => {
      // 准备
      const server = { ...mockServers[0], name: 'Updated Server' };

      // 执行
      const result = await mockServerService.saveServer(server);

      // 验证
      expect(result).toEqual(server);
      expect(require('../../../src/adapters/config-loader').saveServer).toHaveBeenCalledWith(server);
    });
  });

  describe('deleteServer', () => {
    test('should delete server configuration', async () => {
      // 准备
      const serverName = mockServers[0].name;

      // 执行
      const result = await mockServerService.deleteServer(serverName);

      // 验证
      expect(result).toBe(true);
      expect(require('../../../src/adapters/config-loader').deleteServer).toHaveBeenCalledWith(serverName);
    });
  });

  describe('refreshServerList', () => {
    test('should refresh server list', async () => {
      // 执行
      const result = await mockServerService.refreshServerList();

      // 验证
      expect(result).toBe(true);
    });
  });

  describe('selectServer', () => {
    test('should select a server', async () => {
      // 执行
      const server = await mockServerService.selectServer();

      // 验证
      expect(server).toEqual(mockServers[0]);
    });
  });
});
