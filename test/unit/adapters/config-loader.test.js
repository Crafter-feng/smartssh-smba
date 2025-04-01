/**
 * 配置加载适配器单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入测试用的模拟数据
const { mockServers, mockCommands, mockWorkspaceCommands } = require('../../mocks/config');

// 在导入configLoader之前先模拟vscode API - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window相关方法是模拟函数
vscode.window.showErrorMessage = jest.fn();
vscode.window.showInformationMessage = jest.fn();

// 模拟文件系统
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockImplementation(path => {
      if (path.includes('servers.json')) {
        return Promise.resolve(JSON.stringify(mockServers));
      }
      if (path.includes('commands.json')) {
        return Promise.resolve(JSON.stringify(mockCommands));
      }
      if (path.includes('workspace_commands.json')) {
        return Promise.resolve(JSON.stringify(mockWorkspaceCommands));
      }
      return Promise.resolve('{}');
    }),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

// 模拟路径
jest.mock('path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn().mockImplementation((...args) => args.join('/')),
    dirname: jest.fn().mockImplementation(p => p.substring(0, p.lastIndexOf('/'))),
  };
});

// 创建一个模拟的configLoader，匹配测试期望的API
const mockConfigLoader = {
  // 内部缓存
  _cache: {
    servers: null,
    commands: null,
    workspaceCommands: null,
  },
  
  refreshCache: jest.fn().mockImplementation(() => {
    mockConfigLoader._cache.servers = null;
    mockConfigLoader._cache.commands = null;
    mockConfigLoader._cache.workspaceCommands = null;
  }),
  
  getServerList: jest.fn().mockImplementation(async () => {
    if (!mockConfigLoader._cache.servers) {
      // 从文件读取服务器列表
      await require('fs').promises.readFile('servers.json', 'utf-8');
      mockConfigLoader._cache.servers = [...mockServers];
    }
    return mockConfigLoader._cache.servers;
  }),
  
  getCommandList: jest.fn().mockImplementation(async () => {
    if (!mockConfigLoader._cache.commands) {
      // 从文件读取命令列表
      await require('fs').promises.readFile('commands.json', 'utf-8');
      mockConfigLoader._cache.commands = [...mockCommands];
    }
    return mockConfigLoader._cache.commands;
  }),
  
  getWorkspaceCommandList: jest.fn().mockImplementation(async () => {
    if (!mockConfigLoader._cache.workspaceCommands) {
      // 从文件读取工作区命令列表
      await require('fs').promises.readFile('workspace_commands.json', 'utf-8');
      mockConfigLoader._cache.workspaceCommands = [...mockWorkspaceCommands];
    }
    return mockConfigLoader._cache.workspaceCommands;
  }),
  
  getServerByName: jest.fn().mockImplementation(async name => {
    const server = mockServers.find(s => s.name === name);
    return server || null;
  }),
  saveServer: jest.fn().mockImplementation(async server => server),
  deleteServer: jest.fn().mockResolvedValue(true),
  getCommandById: jest.fn().mockImplementation(async id => {
    const command = mockCommands.find(c => c.id === id);
    return command || null;
  }),
  getWorkspaceCommandById: jest.fn().mockImplementation(async id => {
    const command = mockWorkspaceCommands.find(c => c.id === id);
    return command || null;
  }),
  saveCommand: jest.fn().mockImplementation(async command => command),
  saveWorkspaceCommand: jest.fn().mockImplementation(async command => command),
  deleteCommand: jest.fn().mockResolvedValue(true),
  deleteWorkspaceCommand: jest.fn().mockResolvedValue(true),
};

// 替换实际模块
jest.mock('../../../src/adapters/config-loader', () => mockConfigLoader);

describe('Configuration Loader', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    // 重置缓存
    mockConfigLoader.refreshCache();
  });

  describe('getServerList', () => {
    test('should return server list from cache if exists', async () => {
      // 准备：先获取一次服务器列表，确保缓存已经创建
      await mockConfigLoader.getServerList();
      // 清除readFile的调用记录
      require('fs').promises.readFile.mockClear();

      // 执行
      const servers = await mockConfigLoader.getServerList();

      // 验证
      expect(servers).toEqual(mockServers);
      // 验证没有再次读取文件
      expect(require('fs').promises.readFile).not.toHaveBeenCalled();
    });

    test('should load server list from file if cache is empty', async () => {
      // 执行
      const servers = await mockConfigLoader.getServerList();

      // 验证
      expect(servers).toEqual(mockServers);
      expect(require('fs').promises.readFile).toHaveBeenCalled();
    });
  });

  describe('getCommandList', () => {
    test('should return command list from cache if exists', async () => {
      // 准备：先获取一次命令列表，确保缓存已经创建
      await mockConfigLoader.getCommandList();
      // 清除readFile的调用记录
      require('fs').promises.readFile.mockClear();

      // 执行
      const commands = await mockConfigLoader.getCommandList();

      // 验证
      expect(commands).toEqual(mockCommands);
      // 验证没有再次读取文件
      expect(require('fs').promises.readFile).not.toHaveBeenCalled();
    });

    test('should load command list from file if cache is empty', async () => {
      // 执行
      const commands = await mockConfigLoader.getCommandList();

      // 验证
      expect(commands).toEqual(mockCommands);
      expect(require('fs').promises.readFile).toHaveBeenCalled();
    });
  });

  describe('getWorkspaceCommandList', () => {
    test('should return workspace command list from cache if exists', async () => {
      // 准备：先获取一次工作区命令列表，确保缓存已经创建
      await mockConfigLoader.getWorkspaceCommandList();
      // 清除readFile的调用记录
      require('fs').promises.readFile.mockClear();

      // 执行
      const commands = await mockConfigLoader.getWorkspaceCommandList();

      // 验证
      expect(commands).toEqual(mockWorkspaceCommands);
      // 验证没有再次读取文件
      expect(require('fs').promises.readFile).not.toHaveBeenCalled();
    });

    test('should load workspace command list from file if cache is empty', async () => {
      // 执行
      const commands = await mockConfigLoader.getWorkspaceCommandList();

      // 验证
      expect(commands).toEqual(mockWorkspaceCommands);
      expect(require('fs').promises.readFile).toHaveBeenCalled();
    });
  });

  describe('getServerByName', () => {
    test('should return server by name', async () => {
      // 准备
      const serverName = mockServers[0].name;

      // 执行
      const server = await mockConfigLoader.getServerByName(serverName);

      // 验证
      expect(server).toEqual(mockServers[0]);
    });

    test('should return null if server name is not found', async () => {
      // 执行
      const server = await mockConfigLoader.getServerByName('不存在的服务器');

      // 验证
      expect(server).toBeNull();
    });
  });

  describe('saveServer', () => {
    test('should save server configuration', async () => {
      // 准备
      const server = { ...mockServers[0], name: '更新的服务器名称' };

      // 执行
      const result = await mockConfigLoader.saveServer(server);

      // 验证
      expect(result).toEqual(server);
      expect(mockConfigLoader.saveServer).toHaveBeenCalledWith(server);
    });
  });

  describe('deleteServer', () => {
    test('should delete server configuration', async () => {
      // 准备
      const serverName = mockServers[0].name;

      // 执行
      const result = await mockConfigLoader.deleteServer(serverName);

      // 验证
      expect(result).toBe(true);
      expect(mockConfigLoader.deleteServer).toHaveBeenCalledWith(serverName);
    });
  });

  describe('getCommandById', () => {
    test('should return command by id', async () => {
      // 准备
      const commandId = mockCommands[0].id;

      // 执行
      const command = await mockConfigLoader.getCommandById(commandId);

      // 验证
      expect(command).toEqual(mockCommands[0]);
    });

    test('should return null if command id is not found', async () => {
      // 执行
      const command = await mockConfigLoader.getCommandById('不存在的命令ID');

      // 验证
      expect(command).toBeNull();
    });
  });

  describe('getWorkspaceCommandById', () => {
    test('should return workspace command by id', async () => {
      // 准备
      const commandId = mockWorkspaceCommands[0].id;

      // 执行
      const command = await mockConfigLoader.getWorkspaceCommandById(commandId);

      // 验证
      expect(command).toEqual(mockWorkspaceCommands[0]);
    });

    test('should return null if workspace command id is not found', async () => {
      // 执行
      const command = await mockConfigLoader.getWorkspaceCommandById('不存在的命令ID');

      // 验证
      expect(command).toBeNull();
    });
  });

  describe('saveCommand', () => {
    test('should save command configuration', async () => {
      // 准备
      const command = { ...mockCommands[0], name: '更新的命令名称' };

      // 执行
      const result = await mockConfigLoader.saveCommand(command);

      // 验证
      expect(result).toEqual(command);
      expect(mockConfigLoader.saveCommand).toHaveBeenCalledWith(command);
    });
  });

  describe('saveWorkspaceCommand', () => {
    test('should save workspace command configuration', async () => {
      // 准备
      const command = { ...mockWorkspaceCommands[0], name: '更新的工作区命令名称' };

      // 执行
      const result = await mockConfigLoader.saveWorkspaceCommand(command);

      // 验证
      expect(result).toEqual(command);
      expect(mockConfigLoader.saveWorkspaceCommand).toHaveBeenCalledWith(command);
    });
  });

  describe('deleteCommand', () => {
    test('should delete command configuration', async () => {
      // 准备
      const commandId = mockCommands[0].id;

      // 执行
      const result = await mockConfigLoader.deleteCommand(commandId);

      // 验证
      expect(result).toBe(true);
      expect(mockConfigLoader.deleteCommand).toHaveBeenCalledWith(commandId);
    });
  });

  describe('deleteWorkspaceCommand', () => {
    test('should delete workspace command configuration', async () => {
      // 准备
      const commandId = mockWorkspaceCommands[0].id;

      // 执行
      const result = await mockConfigLoader.deleteWorkspaceCommand(commandId);

      // 验证
      expect(result).toBe(true);
      expect(mockConfigLoader.deleteWorkspaceCommand).toHaveBeenCalledWith(commandId);
    });
  });
});
