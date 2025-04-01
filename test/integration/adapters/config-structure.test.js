/**
 * 配置加载适配器配置结构集成测试
 * 这个测试专门检查getConfig返回的配置结构及其与其他函数的兼容性
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 导入模拟配置数据
const { mockServers, mockCommands, mockWorkspaceCommands } = require('../../mocks/config');

// 导入实际的配置加载器模块
jest.unmock('../../../src/adapters/config-loader');
const configLoader = require('../../../src/adapters/config-loader');

// 模拟全局和工作区配置
let mockGlobalConfig = {
  showHostsInPickLists: false,
  serverList: [],
  customCommands: [],
};

let mockWorkspaceConfig = {
  showHostsInPickLists: true,
  serverList: [],
  customCommands: [],
};

describe('Config Loader Structure Integration Tests', () => {
  // 保存原始的getConfiguration方法
  const originalGetConfiguration = vscode.workspace.getConfiguration;

  beforeEach(() => {
    // 重置模拟配置
    mockGlobalConfig = {
      showHostsInPickLists: false,
      serverList: [...mockServers.slice(0, 1)],
      customCommands: [...mockCommands].map(cmd => ({
        ...cmd,
        isWorkspaceCommand: false,
      })),
    };

    mockWorkspaceConfig = {
      showHostsInPickLists: true,
      serverList: [...mockServers.slice(1)],
      customCommands: [...mockWorkspaceCommands].map(cmd => ({
        ...cmd,
        isWorkspaceCommand: true,
        workspaceName: 'Test Workspace',
      })),
    };

    // 模拟vscode配置获取
    vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
      get: (section) => {
        return section === 'config' ? null : null;
      },
      update: jest.fn().mockImplementation((section, value, target) => {
        if (target === vscode.ConfigurationTarget.Global) {
          mockGlobalConfig = value;
        } else {
          mockWorkspaceConfig = value;
        }
        return Promise.resolve();
      }),
      inspect: (section) => ({
        globalValue: section === 'config' ? mockGlobalConfig : null,
        workspaceValue: section === 'config' ? mockWorkspaceConfig : null,
      }),
    }));

    // 清除缓存
    configLoader.refreshCache();

    // 清除所有模拟函数调用记录
    jest.clearAllMocks();
  });

  afterEach(() => {
    // 恢复原始getConfiguration方法
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  describe('getConfig函数测试', () => {
    test('getConfig应该返回合并的配置结构，包含全局和工作区设置', () => {
      // 执行
      const config = configLoader.getConfig();

      // 验证
      expect(config).toBeDefined();

      // 检查配置结构
      expect(config.showHostsInPickLists).toBe(mockWorkspaceConfig.showHostsInPickLists);

      // 检查服务器列表是否正确合并
      expect(config.serverList).toHaveLength(mockGlobalConfig.serverList.length + mockWorkspaceConfig.serverList.length);
      expect(config.serverList[0].name).toBe(mockGlobalConfig.serverList[0].name);
      expect(config.serverList[1].name).toBe(mockWorkspaceConfig.serverList[0].name);

      // 检查自定义命令是否正确合并
      expect(config.customCommands).toHaveLength(mockGlobalConfig.customCommands.length);
      // 检查工作区命令
      expect(config.workspaceCommands).toBeDefined();
      expect(config.workspaceCommands).toHaveLength(mockWorkspaceConfig.customCommands.length);
    });

    test('getConfig应该优先使用工作区设置覆盖全局设置', () => {
      // 修改全局和工作区配置中的相同属性
      mockGlobalConfig.showHostsInPickLists = false;
      mockWorkspaceConfig.showHostsInPickLists = true;

      // 执行
      const config = configLoader.getConfig();

      // 验证工作区设置优先
      expect(config.showHostsInPickLists).toBe(true);
    });

    test('当没有工作区设置时，应该使用全局设置', () => {
      // 移除工作区设置
      mockWorkspaceConfig = null;

      // 执行
      const config = configLoader.getConfig();

      // 验证使用了全局设置
      expect(config.showHostsInPickLists).toBe(mockGlobalConfig.showHostsInPickLists);
      expect(config.serverList).toEqual(mockGlobalConfig.serverList);
    });

    test('当没有全局设置时，应该使用工作区设置', () => {
      // 移除全局设置
      mockGlobalConfig = null;

      // 执行
      const config = configLoader.getConfig();

      // 验证使用了工作区设置
      expect(config.showHostsInPickLists).toBe(mockWorkspaceConfig.showHostsInPickLists);
      expect(config.serverList).toEqual(mockWorkspaceConfig.serverList);
    });

    test('当没有任何设置时，应该返回默认配置', () => {
      // 移除全局和工作区设置
      mockGlobalConfig = null;
      mockWorkspaceConfig = null;

      // 执行
      const config = configLoader.getConfig();

      // 验证返回了默认配置
      expect(config).toBeDefined();
      expect(config.serverList).toEqual([]);
      expect(config.customCommands).toEqual([]);
      expect(config.workspaceCommands).toEqual([]);
    });
  });

  describe('配置结构与其他函数的兼容性测试', () => {
    test('getConfig返回的结构与getServerList兼容', () => {
      // 使用getConfig获取配置
      const config = configLoader.getConfig();

      // 使用getServerList获取服务器列表
      const serverList = configLoader.getServerList();

      // 验证两个函数返回的服务器列表一致
      expect(config.serverList).toEqual(serverList);
      expect(serverList.length).toBe(mockServers.length);
    });

    test('getConfig返回的结构与工作区命令函数兼容', async () => {
      // 使用getConfig获取配置
      const config = configLoader.getConfig();

      // 模拟getWorkspaceCommands返回
      jest.spyOn(configLoader, 'getWorkspaceCommands').mockResolvedValue(mockWorkspaceConfig.customCommands);

      // 使用getWorkspaceCommands获取工作区命令列表
      const workspaceCommands = await configLoader.getWorkspaceCommands();

      // 验证工作区命令列表正确
      expect(workspaceCommands).toBeDefined();
      // 比较命令数量
      expect(workspaceCommands.length).toBe(mockWorkspaceConfig.customCommands.length);
    });

    test('使用addServer后，getConfig和getServerList应该同步更新', async () => {
      // 准备：新服务器
      const newServer = {
        name: '测试新服务器',
        host: 'test.example.com',
        username: 'testuser',
        port: 22,
      };

      // 模拟updateConfig返回true
      jest.spyOn(configLoader, 'updateConfig').mockResolvedValue(true);

      // 添加服务器
      await configLoader.addServer(newServer, false); // 添加到全局配置

      // 清除缓存，模拟配置已更新
      configLoader.refreshCache();

      // 更新mockGlobalConfig以模拟服务器已添加
      mockGlobalConfig.serverList.push(newServer);

      // 获取更新后的配置和服务器列表
      const updatedConfig = configLoader.getConfig();
      const updatedServerList = configLoader.getServerList();

      // 验证两个函数返回的服务器列表一致且包含新服务器
      expect(updatedConfig.serverList).toEqual(updatedServerList);
      expect(updatedServerList.find(s => s.name === newServer.name)).toBeDefined();
      expect(updatedConfig.serverList.find(s => s.name === newServer.name)).toBeDefined();
    });

    test('使用updateServer后，getConfig和getServerList应该同步更新', async () => {
      // 准备：现有服务器和更新信息
      const serverToUpdate = mockGlobalConfig.serverList[0];
      const updatedServer = {
        ...serverToUpdate,
        host: 'updated.example.com',
      };

      // 模拟updateConfig返回true
      jest.spyOn(configLoader, 'updateConfig').mockResolvedValue(true);

      // 更新服务器
      await configLoader.updateServer(serverToUpdate.name, updatedServer);

      // 清除缓存，模拟配置已更新
      configLoader.refreshCache();

      // 更新mockGlobalConfig以模拟服务器已更新
      mockGlobalConfig.serverList[0] = updatedServer;

      // 获取更新后的配置和服务器列表
      const updatedConfig = configLoader.getConfig();
      const updatedServerList = configLoader.getServerList();

      // 验证两个函数返回的服务器列表一致且反映了更新
      expect(updatedConfig.serverList).toEqual(updatedServerList);
      const serverInConfig = updatedConfig.serverList.find(s => s.name === serverToUpdate.name);
      const serverInList = updatedServerList.find(s => s.name === serverToUpdate.name);
      expect(serverInConfig).toBeDefined();
      expect(serverInList).toBeDefined();
      expect(serverInConfig.host).toBe('updated.example.com');
      expect(serverInList.host).toBe('updated.example.com');
    });

    test('使用deleteServer后，getConfig和getServerList应该同步更新', async () => {
      // 准备：获取现有服务器
      const serverToDelete = mockGlobalConfig.serverList[0];

      // 模拟updateConfig返回true
      jest.spyOn(configLoader, 'updateConfig').mockResolvedValue(true);

      // 删除服务器
      await configLoader.deleteServer(serverToDelete.name);

      // 清除缓存，模拟配置已更新
      configLoader.refreshCache();

      // 更新mockGlobalConfig以模拟服务器已删除
      mockGlobalConfig.serverList = [];

      // 获取更新后的配置和服务器列表
      const updatedConfig = configLoader.getConfig();
      const updatedServerList = configLoader.getServerList();

      // 验证两个函数返回的服务器列表一致且不包含已删除服务器
      expect(updatedConfig.serverList).toEqual(updatedServerList);
      expect(updatedServerList.find(s => s.name === serverToDelete.name)).toBeUndefined();
      expect(updatedConfig.serverList.find(s => s.name === serverToDelete.name)).toBeUndefined();
    });
  });

  describe('缓存机制测试', () => {
    test('refreshCache应该清除配置缓存', () => {
      // 先获取初始配置
      const initialConfig = configLoader.getConfig();

      // 直接修改模拟配置（不通过配置加载器API）
      mockGlobalConfig.serverList.push({
        name: '直接添加的服务器',
        host: 'direct.example.com',
        username: 'directuser',
        port: 22,
      });

      // 不刷新缓存直接获取配置
      const cachedConfig = configLoader.getConfig();

      // 验证返回的是缓存的配置（不包含直接添加的服务器）
      expect(cachedConfig.serverList.length).toBe(initialConfig.serverList.length);

      // 修改时间戳以让缓存失效，模拟刷新缓存
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000); // 增加2秒，超过缓存有效期

      // 再次获取配置
      const refreshedConfig = configLoader.getConfig();

      // 验证现在包含了直接添加的服务器
      expect(refreshedConfig.serverList.length).toBe(initialConfig.serverList.length + 1);
      expect(refreshedConfig.serverList.find(s => s.name === '直接添加的服务器')).toBeDefined();
    });
  });
}); 