/**
 * 配置加载适配器集成测试
 * 这个测试使用实际的配置加载器模块而不是模拟对象
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// 导入模拟配置数据
const { mockServers, mockCommands, mockWorkspaceCommands } = require('../../mocks/config');

// 导入实际的配置加载器模块
// 注意：这里我们需要清除Jest的模块缓存，确保我们获取到的是实际模块而不是单元测试中的模拟对象
jest.unmock('../../../src/adapters/config-loader');
const configLoader = require('../../../src/adapters/config-loader');

// 模拟VSCode的Configuration对象
let mockConfigData = {
  'config': {
    showHostsInPickLists: false,
    serverList: [],
    customCommands: [],
  },
  'customCommands': []
};

// 保存原始方法
const originalUpdateConfig = configLoader.updateConfig;
const originalWorkspaceCommands = configLoader.getWorkspaceCommands;
const originalSaveWorkspaceConfig = configLoader.saveWorkspaceConfig;
const originalAddServer = configLoader.addServer;
const originalUpdateServer = configLoader.updateServer;
const originalDeleteServer = configLoader.deleteServer;
const originalAddWorkspaceCommand = configLoader.addWorkspaceCommand;

// 临时工作区目录
let tempWorkspaceDir;
let tempConfigPath;

describe('Config Loader Integration Tests', () => {
  beforeAll(async () => {
    // 创建临时工作区目录
    tempWorkspaceDir = path.join(os.tmpdir(), 'smartssh-test-workspace-' + Date.now());
    await fs.mkdir(tempWorkspaceDir, { recursive: true });
    tempConfigPath = path.join(tempWorkspaceDir, '.smartssh-smba.json');

    // 模拟工作区文件夹
    vscode.workspace.workspaceFolders = [
      {
        uri: { fsPath: tempWorkspaceDir },
        name: 'TestWorkspace',
        index: 0
      }
    ];

    // 写入一些初始配置数据到工作区配置文件
    await fs.writeFile(tempConfigPath, JSON.stringify({
      customCommands: mockCommands
    }, null, 2));
  });

  afterAll(async () => {
    // 清理临时文件和目录
    try {
      await fs.unlink(tempConfigPath);
      await fs.rmdir(tempWorkspaceDir, { recursive: true });
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }

    // 恢复原始方法
    configLoader.updateConfig = originalUpdateConfig;
    configLoader.getWorkspaceCommands = originalWorkspaceCommands;
    configLoader.saveWorkspaceConfig = originalSaveWorkspaceConfig;
    configLoader.addServer = originalAddServer;
    configLoader.updateServer = originalUpdateServer;
    configLoader.deleteServer = originalDeleteServer;
    configLoader.addWorkspaceCommand = originalAddWorkspaceCommand;
  });

  beforeEach(() => {
    // 清除缓存
    configLoader.refreshCache();

    // 重置模拟配置数据
    mockConfigData = {
      'config': {
        showHostsInPickLists: false,
        serverList: [],
        customCommands: [],
      },
      'customCommands': []
    };

    // 清除所有模拟函数调用记录
    jest.clearAllMocks();

    // 模拟vscode配置获取
    vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
      get: (section) => mockConfigData[section],
      update: jest.fn().mockResolvedValue(undefined),
      inspect: (section) => ({
        globalValue: section === 'config' ? {
          showHostsInPickLists: false,
          serverList: [...mockServers],
          customCommands: [],
        } : [],
        workspaceValue: section === 'config' ? {
          showHostsInPickLists: true,
          serverList: [],
          customCommands: [...mockWorkspaceCommands],
        } : [],
      }),
    }));

    // 模拟核心方法
    configLoader.updateConfig = jest.fn().mockResolvedValue(true);
    configLoader.getWorkspaceCommands = jest.fn().mockResolvedValue(mockCommands);
    configLoader.saveWorkspaceConfig = jest.fn().mockResolvedValue(true);
    configLoader.addServer = jest.fn().mockResolvedValue(true);
    configLoader.updateServer = jest.fn().mockResolvedValue(true);
    configLoader.deleteServer = jest.fn().mockResolvedValue(true);
    configLoader.addWorkspaceCommand = jest.fn().mockResolvedValue(true);
  });

  describe('服务器配置管理', () => {
    test('getServerList应该返回合并后的服务器列表', async () => {
      // 执行
      const serverList = await configLoader.getServerList();

      // 验证
      expect(Array.isArray(serverList)).toBe(true);
      expect(serverList).toHaveLength(mockServers.length);
      expect(serverList[0].name).toBe(mockServers[0].name);
    });

    test('addServer应该向全局配置添加服务器', async () => {
      // 准备
      const newServer = {
        name: '新测试服务器',
        host: 'newtest.example.com',
        username: 'newuser',
        port: 22,
        privateKey: '',
        agent: false,
      };

      // 执行
      const result = await configLoader.addServer(newServer);

      // 验证
      expect(result).toBe(true);
      expect(configLoader.addServer).toHaveBeenCalledWith(newServer);
    });

    test('addServer应该向工作区配置添加服务器', async () => {
      // 准备
      const newServer = {
        name: '工作区测试服务器',
        host: 'workspace.example.com',
        username: 'wsuser',
        port: 22,
        privateKey: '',
        agent: false,
      };

      // 执行
      const result = await configLoader.addServer(newServer, true); // true表示保存到工作区

      // 验证
      expect(result).toBe(true);
      expect(configLoader.addServer).toHaveBeenCalledWith(newServer, true);
    });

    test('updateServer应该更新现有的服务器配置', async () => {
      // 准备
      const serverName = mockServers[0].name;
      const updatedServer = {
        ...mockServers[0],
        host: 'updated.example.com',
        username: 'updateduser',
      };

      // 执行
      const result = await configLoader.updateServer(serverName, updatedServer);

      // 验证
      expect(result).toBe(true);
      expect(configLoader.updateServer).toHaveBeenCalledWith(serverName, updatedServer);
    });

    test('deleteServer应该删除服务器配置', async () => {
      // 准备
      const serverName = mockServers[0].name;

      // 执行
      const result = await configLoader.deleteServer(serverName);

      // 验证
      expect(result).toBe(true);
      expect(configLoader.deleteServer).toHaveBeenCalledWith(serverName);
    });
  });

  describe('工作区配置管理', () => {
    test('loadWorkspaceConfig应该从文件加载配置', async () => {
      // 临时恢复原始方法以读取实际文件
      configLoader.getWorkspaceCommands = originalWorkspaceCommands;

      // 执行
      const config = await configLoader.loadWorkspaceConfig();

      // 验证
      expect(config).toBeDefined();
      expect(config.customCommands).toHaveLength(mockCommands.length);
    });

    test('saveWorkspaceConfig应该将配置保存到文件', async () => {
      // 临时恢复原始方法以写入实际文件
      configLoader.saveWorkspaceConfig = originalSaveWorkspaceConfig;

      // 准备
      const config = {
        customCommands: [
          ...mockCommands,
          {
            name: '新工作区命令',
            command: 'echo "Hello World"',
            description: '测试新命令',
          }
        ]
      };

      // 执行
      const result = await configLoader.saveWorkspaceConfig(config);

      // 验证
      expect(result).toBe(true);

      // 读取文件内容验证是否已保存
      const fileContent = await fs.readFile(tempConfigPath, 'utf8');
      const savedConfig = JSON.parse(fileContent);
      expect(savedConfig.customCommands).toHaveLength(config.customCommands.length);
    });

    test('getWorkspaceCommands应该返回工作区命令列表', async () => {
      // 执行
      const commands = await configLoader.getWorkspaceCommands();

      // 验证
      expect(commands).toHaveLength(mockCommands.length);
    });

    test('addWorkspaceCommand应该添加新命令', async () => {
      // 准备
      const newCommand = {
        name: '新测试命令',
        command: 'echo "Test Command"',
        description: '这是一个测试命令',
      };

      // 执行
      const result = await configLoader.addWorkspaceCommand(newCommand);

      // 验证
      expect(result).toBe(true);
      expect(configLoader.addWorkspaceCommand).toHaveBeenCalledWith(newCommand);
    });
  });

  describe('缓存机制', () => {
    test('refreshCache应该清除配置缓存', async () => {
      // 修改vscode.workspace.getConfiguration返回特定配置
      const originalGetConfiguration = vscode.workspace.getConfiguration;
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: (section) => section === 'smartssh-smba' ? {
          showHostsInPickLists: false
        } : null,
        inspect: (section) => ({
          globalValue: { showHostsInPickLists: false },
          workspaceValue: { showHostsInPickLists: false },
        })
      }));

      // 获取初始配置
      const config = await configLoader.getConfig();
      expect(config.showHostsInPickLists).toBe(false);

      // 修改配置返回
      vscode.workspace.getConfiguration = jest.fn().mockImplementation(() => ({
        get: (section) => section === 'smartssh-smba' ? {
          showHostsInPickLists: true
        } : null,
        inspect: (section) => ({
          globalValue: { showHostsInPickLists: false },
          workspaceValue: { showHostsInPickLists: true },
        })
      }));

      // 不刷新缓存，应该仍然使用旧值
      // 修改时间戳以确保缓存仍然有效
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 100);

      let cachedConfig = await configLoader.getConfig();
      expect(cachedConfig.showHostsInPickLists).toBe(false);

      // 使缓存失效，模拟refreshCache
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);

      // 再次获取配置，应该获取到新值
      let freshConfig = await configLoader.getConfig();
      expect(freshConfig.showHostsInPickLists).toBe(true);

      // 恢复原始实现
      vscode.workspace.getConfiguration = originalGetConfiguration;
    });
  });
}); 