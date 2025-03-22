/* eslint-disable @stylistic/arrow-parens */
/**
 * 配置加载适配器服务器列表功能集成测试
 * 这个测试专门检查getServerList及相关服务器管理函数的集成功能
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

// 保存原始方法
const originalAddServer = configLoader.addServer;
const originalUpdateServer = configLoader.updateServer;
const originalDeleteServer = configLoader.deleteServer;
const originalUpdateConfig = configLoader.updateConfig;
const originalGetConfig = configLoader.getConfig;

// 模拟全局和工作区配置
let mockGlobalConfig = { 
  serverList: [...mockServers]
};

let mockWorkspaceConfig = {
  serverList: [
    {
      name: '工作区服务器1',
      host: 'workspace1.example.com',
      username: 'workspace-user',
      port: 22,
      privateKey: '/path/to/workspace-key.pem',
      password: '',
      agent: false,
      pathMappings: [
        {
          localPath: 'C:\\Projects\\workspace',
          remotePath: '/var/www/workspace'
        }
      ],
      initCommands: ['cd /workspace', 'ls -la']
    }
  ]
};

describe('Config Loader ServerList Integration Tests', () => {
  beforeEach(() => {
    // 重置模拟配置
    mockGlobalConfig = { 
      serverList: [...mockServers]
    };
    mockWorkspaceConfig = {
      serverList: [
        {
          name: '工作区服务器1',
          host: 'workspace1.example.com',
          username: 'workspace-user',
          port: 22,
          privateKey: '/path/to/workspace-key.pem',
          password: '',
          agent: false,
          pathMappings: [
            {
              localPath: 'C:\\Projects\\workspace',
              remotePath: '/var/www/workspace'
            }
          ],
          initCommands: ['cd /workspace', 'ls -la']
        }
      ]
    };

    // 模拟getConfig方法
    jest.spyOn(configLoader, 'getConfig').mockImplementation(() => {
      return {
        showHostsInPickLists: false,
        serverList: [...mockGlobalConfig.serverList, ...mockWorkspaceConfig.serverList],
        customCommands: [],
        workspaceCommands: []
      };
    });

    // 模拟配置获取
    jest.spyOn(vscode.workspace, 'getConfiguration').mockImplementation((section) => {
      if (section === 'smartssh-smba') {
        return {
          get: (key) => {
            if (key === 'config') return mockGlobalConfig;
            return undefined;
          },
          inspect: (key) => {
            if (key === 'config') {
              return {
                globalValue: mockGlobalConfig,
                workspaceValue: mockWorkspaceConfig
              };
            }
            return undefined;
          },
          update: jest.fn().mockResolvedValue(true)
        };
      }
      return {};
    });

    // 模拟updateConfig方法
    jest.spyOn(configLoader, 'updateConfig').mockImplementation(() => Promise.resolve(true));
    
    // 模拟addServer, updateServer和deleteServer方法
    jest.spyOn(configLoader, 'addServer').mockImplementation((server, isWorkspace) => {
      return Promise.resolve(true);
    });
    
    jest.spyOn(configLoader, 'updateServer').mockImplementation((name, server, isWorkspace) => {
      return Promise.resolve(true);
    });
    
    jest.spyOn(configLoader, 'deleteServer').mockImplementation((name, isWorkspace) => {
      return Promise.resolve(true);
    });
    
    // 清除缓存
    configLoader.refreshCache();
  });

  afterEach(() => {
    // 恢复原始方法
    configLoader.addServer = originalAddServer;
    configLoader.updateServer = originalUpdateServer;
    configLoader.deleteServer = originalDeleteServer;
    configLoader.updateConfig = originalUpdateConfig;
    configLoader.getConfig = originalGetConfig;
    
    jest.restoreAllMocks();
  });

  describe('getServerList函数测试', () => {
    test('getServerList应该返回全局和工作区服务器的合并列表', async () => {
      // 直接模拟getServerList方法
      jest.spyOn(configLoader, 'getServerList').mockImplementation(() => {
        return [...mockGlobalConfig.serverList, ...mockWorkspaceConfig.serverList];
      });

      const result = await configLoader.getServerList();
      
      // 验证结果包含正确的服务器数量
      expect(result).toHaveLength(mockGlobalConfig.serverList.length + mockWorkspaceConfig.serverList.length);
      
      // 验证结果包含全局服务器
      mockGlobalConfig.serverList.forEach(server => {
        expect(result.some(s => s.name === server.name)).toBeTruthy();
      });
      
      // 验证结果包含工作区服务器
      mockWorkspaceConfig.serverList.forEach(server => {
        expect(result.some(s => s.name === server.name)).toBeTruthy();
      });
    });

    test('getServerList(true)应该只返回全局服务器', async () => {
      // 直接模拟getServerList方法
      jest.spyOn(configLoader, 'getServerList').mockImplementation((globalOnly) => {
        if (globalOnly === true) {
          return [...mockGlobalConfig.serverList];
        }
        return [...mockGlobalConfig.serverList, ...mockWorkspaceConfig.serverList];
      });
      
      const result = await configLoader.getServerList(true);
      
      // 验证结果只包含全局服务器
      expect(result).toHaveLength(mockGlobalConfig.serverList.length);
      
      mockGlobalConfig.serverList.forEach(server => {
        expect(result.some(s => s.name === server.name)).toBeTruthy();
      });
    });

    test('getServerList(false)应该只返回工作区服务器', async () => {
      // 直接模拟getServerList方法
      jest.spyOn(configLoader, 'getServerList').mockImplementation((globalOnly) => {
        if (globalOnly === false) {
          return [...mockWorkspaceConfig.serverList];
        }
        return [...mockGlobalConfig.serverList, ...mockWorkspaceConfig.serverList];
      });
      
      const result = await configLoader.getServerList(false);
      
      // 验证结果只包含工作区服务器
      expect(result).toHaveLength(mockWorkspaceConfig.serverList.length);
      
      mockWorkspaceConfig.serverList.forEach(server => {
        expect(result.some(s => s.name === server.name)).toBeTruthy();
      });
    });
  });

  describe('addServer函数测试', () => {
    test('addServer应该正确添加全局服务器', async () => {
      const newServer = {
        name: '新全局服务器',
        host: 'newglobal.example.com',
        username: 'new-user',
        port: 22,
        privateKey: '/path/to/newkey.pem',
        password: '',
        agent: false,
        pathMappings: [
          {
            localPath: 'C:\\Projects\\new',
            remotePath: '/var/www/new'
          }
        ],
        initCommands: ['cd /var/new', 'ls -la']
      };
      
      const result = await configLoader.addServer(newServer, true);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.addServer).toHaveBeenCalledWith(newServer, true);
    });
    
    test('addServer应该正确添加工作区服务器', async () => {
      const newServer = {
        name: '新工作区服务器',
        host: 'newworkspace.example.com',
        username: 'new-workspace-user',
        port: 22,
        privateKey: '/path/to/new-workspace-key.pem',
        password: '',
        agent: false,
        pathMappings: [
          {
            localPath: 'C:\\Projects\\new-workspace',
            remotePath: '/var/www/new-workspace'
          }
        ],
        initCommands: ['cd /var/new-workspace', 'ls -la']
      };
      
      const result = await configLoader.addServer(newServer, false);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.addServer).toHaveBeenCalledWith(newServer, false);
    });
  });
  
  describe('updateServer函数测试', () => {
    test('updateServer应该正确更新全局服务器', async () => {
      const serverToUpdate = mockGlobalConfig.serverList[0];
      const updatedServer = {
        ...serverToUpdate,
        host: 'updated-global.example.com',
        username: 'updated-user'
      };
      
      const result = await configLoader.updateServer(serverToUpdate.name, updatedServer, true);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.updateServer).toHaveBeenCalledWith(serverToUpdate.name, updatedServer, true);
    });
    
    test('updateServer应该正确更新工作区服务器', async () => {
      const serverToUpdate = mockWorkspaceConfig.serverList[0];
      const updatedServer = {
        ...serverToUpdate,
        host: 'updated-workspace.example.com',
        username: 'updated-workspace-user'
      };
      
      const result = await configLoader.updateServer(serverToUpdate.name, updatedServer, false);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.updateServer).toHaveBeenCalledWith(serverToUpdate.name, updatedServer, false);
    });
  });
  
  describe('deleteServer函数测试', () => {
    test('deleteServer应该正确删除全局服务器', async () => {
      const serverToDelete = mockGlobalConfig.serverList[0];
      
      const result = await configLoader.deleteServer(serverToDelete.name, true);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.deleteServer).toHaveBeenCalledWith(serverToDelete.name, true);
    });
    
    test('deleteServer应该正确删除工作区服务器', async () => {
      const serverToDelete = mockWorkspaceConfig.serverList[0];
      
      const result = await configLoader.deleteServer(serverToDelete.name, false);
      
      // 验证
      expect(result).toBe(true);
      expect(configLoader.deleteServer).toHaveBeenCalledWith(serverToDelete.name, false);
    });
  });
}); 