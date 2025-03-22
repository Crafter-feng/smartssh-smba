/**
 * 配置加载适配器 getConfig 集成测试
 * 这个测试专门检查 getConfig 和 getServerList 之间的集成
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 导入模拟配置数据
const { mockServers, mockCommands } = require('../../mocks/config');

// 导入实际的配置加载器模块
jest.unmock('../../../src/adapters/config-loader');
const configLoader = require('../../../src/adapters/config-loader');

// 实际配置结构检查
describe('Config Loader GetConfig Integration Tests', () => {
  // 保存原始的getConfiguration方法
  const originalGetConfiguration = vscode.workspace.getConfiguration;
  
  beforeEach(() => {
    // 清除缓存
    configLoader.refreshCache();
    
    // 清除所有模拟函数调用记录
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // 恢复原始getConfiguration方法
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  describe('getConfig与getServerList的集成', () => {
    test('getConfig应该返回正确的数据结构，getServerList能正确使用', () => {
      // 模拟配置数据
      const mockConfigValue = {
        serverList: [...mockServers],
        showHostsInPickLists: true,
        customCommands: [...mockCommands]
      };
      
      // 模拟VSCode的Configuration对象
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: (section) => section === 'config' ? mockConfigValue : null,
        inspect: (section) => ({
          globalValue: section === 'config' ? {
            serverList: mockServers.slice(0, 1),
            showHostsInPickLists: false,
            customCommands: []
          } : null,
          workspaceValue: section === 'config' ? {
            serverList: mockServers.slice(1),
            showHostsInPickLists: true,
            customCommands: mockCommands
          } : null,
        }),
      }));
      
      // 获取配置
      const config = configLoader.getConfig();
      
      // 验证配置结构
      expect(config).toBeDefined();
      expect(config.serverList).toBeDefined();
      expect(Array.isArray(config.serverList)).toBe(true);
      expect(config.serverList.length).toBe(mockServers.length);
      
      // 获取服务器列表
      const serverList = configLoader.getServerList();
      
      // 验证服务器列表
      expect(serverList).toBeDefined();
      expect(Array.isArray(serverList)).toBe(true);
      expect(serverList.length).toBe(mockServers.length);
      
      // 验证两个服务器列表是一致的
      expect(serverList).toEqual(config.serverList);
    });
    
    test('空配置时getConfig和getServerList应该返回空数组', () => {
      // 模拟空配置
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: () => null,
        inspect: () => ({
          globalValue: null,
          workspaceValue: null,
        }),
      }));
      
      // 获取配置
      const config = configLoader.getConfig();
      
      // 验证配置结构
      expect(config).toBeDefined();
      expect(config.serverList).toBeDefined();
      expect(Array.isArray(config.serverList)).toBe(true);
      expect(config.serverList.length).toBe(0);
      
      // 获取服务器列表
      const serverList = configLoader.getServerList();
      
      // 验证服务器列表
      expect(serverList).toBeDefined();
      expect(Array.isArray(serverList)).toBe(true);
      expect(serverList.length).toBe(0);
    });

    test('仅有全局配置时应该只返回全局服务器', () => {
      // 模拟只有全局配置
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: () => null,
        inspect: (section) => ({
          globalValue: section === 'config' ? {
            serverList: mockServers.slice(0, 1),
            showHostsInPickLists: false,
            customCommands: []
          } : null,
          workspaceValue: null,
        }),
      }));
      
      // 获取配置
      const config = configLoader.getConfig();
      
      // 验证配置结构
      expect(config).toBeDefined();
      expect(config.serverList).toBeDefined();
      expect(Array.isArray(config.serverList)).toBe(true);
      expect(config.serverList.length).toBe(1);
      
      // 获取服务器列表
      const serverList = configLoader.getServerList();
      
      // 验证服务器列表
      expect(serverList).toBeDefined();
      expect(Array.isArray(serverList)).toBe(true);
      expect(serverList.length).toBe(1);
      expect(serverList[0].name).toBe(mockServers[0].name);
    });

    test('仅有工作区配置时应该只返回工作区服务器', () => {
      // 模拟只有工作区配置
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: () => null,
        inspect: (section) => ({
          globalValue: null,
          workspaceValue: section === 'config' ? {
            serverList: mockServers.slice(1),
            showHostsInPickLists: true,
            customCommands: mockCommands
          } : null,
        }),
      }));
      
      // 获取配置
      const config = configLoader.getConfig();
      
      // 验证配置结构
      expect(config).toBeDefined();
      expect(config.serverList).toBeDefined();
      expect(Array.isArray(config.serverList)).toBe(true);
      expect(config.serverList.length).toBe(mockServers.length - 1);
      
      // 获取服务器列表
      const serverList = configLoader.getServerList();
      
      // 验证服务器列表
      expect(serverList).toBeDefined();
      expect(Array.isArray(serverList)).toBe(true);
      expect(serverList.length).toBe(mockServers.length - 1);
      expect(serverList[0].name).toBe(mockServers[1].name);
    });
    
    test('缓存机制应该正常工作', () => {
      // 首先模拟一个初始配置
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: () => null,
        inspect: (section) => ({
          globalValue: section === 'config' ? {
            serverList: mockServers.slice(0, 1),
            showHostsInPickLists: false,
            customCommands: []
          } : null,
          workspaceValue: null,
        }),
      }));
      
      // 第一次获取配置，这会将配置缓存
      const config1 = configLoader.getConfig();
      expect(config1.serverList.length).toBe(1);
      
      // 改变模拟的返回值，但由于缓存机制，我们应该仍然得到相同的结果
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: () => null,
        inspect: (section) => ({
          globalValue: section === 'config' ? {
            serverList: mockServers,
            showHostsInPickLists: false,
            customCommands: []
          } : null,
          workspaceValue: null,
        }),
      }));
      
      // 未清除缓存前，应该仍然返回缓存的配置
      const config2 = configLoader.getConfig();
      expect(config2.serverList.length).toBe(1);
      
      // 清除缓存
      configLoader.refreshCache();
      
      // 清除缓存后，应该获取到新的配置
      const config3 = configLoader.getConfig();
      expect(config3.serverList.length).toBe(mockServers.length);
    });
  });
}); 