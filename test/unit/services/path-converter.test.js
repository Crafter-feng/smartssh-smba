/**
 * 路径转换器模块单元测试
 */
const vscode = require('../../mocks/vscode');
const { mockServers } = require('../../mocks/config');
const path = require('path');

// 在导入模块之前先模拟vscode API
jest.mock('vscode', () => vscode);

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
  getServerByName: jest.fn((name) => {
    const server = mockServers.find(s => s.name === name);
    return server ? { ...server } : null;
  }),
}));

// 导入模块
const pathConverter = require('../../../src/services/path-converter');

describe('Path Converter Module', () => {
  const testServer = mockServers[0];
  
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  test('should convert local path to remote path', () => {
    // 准备
    const localPath = 'C:\\Projects\\test1\\file.txt';
    const expectedRemotePath = '/var/www/test1/file.txt';
    
    // 执行
    const remotePath = pathConverter.convertLocalPathToRemote(localPath, testServer);
    
    // 验证
    expect(remotePath).toBe(expectedRemotePath);
  });

  test('should convert local path with backslashes to remote path with forward slashes', () => {
    // 准备
    const localPath = 'C:\\Projects\\test1\\folder\\file.txt';
    const expectedRemotePath = '/var/www/test1/folder/file.txt';
    
    // 执行
    const remotePath = pathConverter.convertLocalPathToRemote(localPath, testServer);
    
    // 验证
    expect(remotePath).toBe(expectedRemotePath);
  });

  test('should return null when local path does not match any mapping', () => {
    // 准备
    const localPath = 'D:\\OtherProjects\\file.txt';
    
    // 执行
    const remotePath = pathConverter.convertLocalPathToRemote(localPath, testServer);
    
    // 验证
    expect(remotePath).toBeNull();
  });

  test('should return null when server is not provided', () => {
    // 准备
    const localPath = 'C:\\Projects\\test1\\file.txt';
    
    // 执行
    const remotePath = pathConverter.convertLocalPathToRemote(localPath);
    
    // 验证
    expect(remotePath).toBeNull();
  });

  test('should convert remote path to local path', () => {
    // 准备
    const remotePath = '/var/www/test1/file.txt';
    const expectedLocalPath = 'C:\\Projects\\test1\\file.txt';
    
    // 执行
    const localPath = pathConverter.convertRemotePathToLocal(remotePath, testServer);
    
    // 验证
    expect(localPath).toBe(expectedLocalPath);
  });

  test('should convert remote path with tilde to local path', () => {
    // 准备
    // 假设本地映射路径 C:\\Projects\\test1 对应远程 ~/test1
    const customServer = {
      ...testServer,
      pathMappings: [
        {
          localPath: 'C:\\Projects\\test1',
          remotePath: '~/test1',
        },
      ],
    };
    const remotePath = '~/test1/file.txt';
    const expectedLocalPath = 'C:\\Projects\\test1\\file.txt';
    
    // 执行
    const localPath = pathConverter.convertRemotePathToLocal(remotePath, customServer);
    
    // 验证
    expect(localPath).toBe(expectedLocalPath);
  });

  test('should find server for local path', () => {
    // 准备
    const localPath = 'C:\\Projects\\test1\\file.txt';
    
    // 执行
    const server = pathConverter.findServerForPath(localPath);
    
    // 验证
    expect(server).toMatchObject({
      name: testServer.name,
      host: testServer.host,
    });
  });

  test('should return null when no server matches the local path', () => {
    // 准备
    const localPath = 'D:\\UnmappedPath\\file.txt';
    
    // 执行
    const server = pathConverter.findServerForPath(localPath);
    
    // 验证
    expect(server).toBeNull();
  });

  test('should handle paths with multiple mappings correctly', () => {
    // 准备
    const serverWithMultipleMappings = {
      ...testServer,
      pathMappings: [
        {
          localPath: 'C:\\Projects\\test1\\subdir1',
          remotePath: '/var/www/test1/special',
        },
        {
          localPath: 'C:\\Projects\\test1',
          remotePath: '/var/www/test1',
        },
      ],
    };
    
    // 执行 - 应该使用第一个匹配（最具体的路径）
    const localPath = 'C:\\Projects\\test1\\subdir1\\file.txt';
    const remotePath = pathConverter.convertLocalPathToRemote(localPath, serverWithMultipleMappings);
    
    // 验证
    expect(remotePath).toBe('/var/www/test1/special/file.txt');
  });
}); 