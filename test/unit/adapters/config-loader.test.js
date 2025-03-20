/**
 * 配置加载器模块单元测试
 */
const vscode = require('../../mocks/vscode');
const { mockConfiguration, mockWorkspaceConfiguration } = require('../../mocks/config');
const path = require('path');
const fs = require('fs');

// 在导入configLoader之前先模拟vscode API
jest.mock('vscode', () => vscode);

// 模拟文件系统
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// 模拟路径处理
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  normalize: jest.fn(path => path),
}));

// 设置配置获取的模拟返回值
vscode.workspace.getConfiguration.mockImplementation((section) => {
  if (section === 'smartssh-smba') {
    return {
      get: (key) => {
        if (key === 'config') {
          return mockConfiguration['smartssh-smba.config'];
        }
        return undefined;
      },
      update: jest.fn().mockResolvedValue(undefined),
    };
  }
  return {
    get: () => undefined,
    update: jest.fn().mockResolvedValue(undefined),
  };
});

// 导入configLoader模块
const configLoader = require('../../../src/adapters/config-loader');

describe('Config Loader Module', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  test('should load global configuration from vscode settings', () => {
    // 执行
    const config = configLoader.getConfiguration();
    
    // 验证
    expect(config).toEqual(mockConfiguration['smartssh-smba.config']);
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('smartssh-smba');
  });

  test('should save global configuration to vscode settings', async () => {
    // 准备
    const newConfig = {
      ...mockConfiguration['smartssh-smba.config'],
      showHostsInPickLists: false,
    };
    
    // 执行
    await configLoader.saveConfiguration(newConfig);
    
    // 验证
    expect(vscode.workspace.getConfiguration('smartssh-smba').update)
      .toHaveBeenCalledWith('config', newConfig, true);
  });

  test('should get server list from configuration', () => {
    // 执行
    const servers = configLoader.getServerList();
    
    // 验证
    expect(servers).toEqual(mockConfiguration['smartssh-smba.config'].serverList);
  });

  test('should get server by name', () => {
    // 准备
    const serverName = '测试服务器1';
    
    // 执行
    const server = configLoader.getServerByName(serverName);
    
    // 验证
    expect(server).toEqual(mockConfiguration['smartssh-smba.config'].serverList[0]);
  });

  test('should return null when server not found', () => {
    // 执行
    const server = configLoader.getServerByName('不存在的服务器');
    
    // 验证
    expect(server).toBeNull();
  });

  test('should add a new server to the configuration', async () => {
    // 准备
    const newServer = {
      name: '新服务器',
      host: 'new.example.com',
      username: 'newuser',
      port: 22,
    };
    
    // 执行
    await configLoader.addServer(newServer);
    
    // 验证
    expect(vscode.workspace.getConfiguration('smartssh-smba').update)
      .toHaveBeenCalledWith('config', expect.objectContaining({
        serverList: expect.arrayContaining([newServer]),
      }), true);
  });

  test('should update an existing server', async () => {
    // 准备
    const updatedServer = {
      ...mockConfiguration['smartssh-smba.config'].serverList[0],
      host: 'updated.example.com',
    };
    
    // 执行
    await configLoader.updateServer(updatedServer);
    
    // 验证
    expect(vscode.workspace.getConfiguration('smartssh-smba').update)
      .toHaveBeenCalledWith('config', expect.objectContaining({
        serverList: expect.arrayContaining([updatedServer]),
      }), true);
  });

  test('should remove a server from configuration', async () => {
    // 准备
    const serverToRemove = mockConfiguration['smartssh-smba.config'].serverList[0];
    
    // 执行
    await configLoader.removeServer(serverToRemove.name);
    
    // 验证
    expect(vscode.workspace.getConfiguration('smartssh-smba').update)
      .toHaveBeenCalledWith('config', expect.objectContaining({
        serverList: expect.not.arrayContaining([serverToRemove]),
      }), true);
  });

  test('should get global commands from configuration', () => {
    // 执行
    const commands = configLoader.getGlobalCommands();
    
    // 验证
    expect(commands).toEqual(mockConfiguration['smartssh-smba.config'].customCommands);
  });

  test('should refresh configuration cache', () => {
    // 执行
    configLoader.refreshCache();
    
    // 验证 - 下一次获取配置时应重新从vscode获取
    configLoader.getConfiguration();
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledTimes(1);
  });
}); 