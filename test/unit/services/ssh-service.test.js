/**
 * SSH服务模块单元测试
 */
const vscode = require('../../mocks/vscode');
const { mockServers } = require('../../mocks/config');

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

// 模拟path-converter
jest.mock('../../../src/services/path-converter', () => ({
  convertLocalPathToRemote: jest.fn((localPath, server) => {
    if (localPath.includes('Projects\\test1') && server) {
      return localPath.replace('C:\\Projects\\test1', '/var/www/test1').replace(/\\/g, '/');
    }
    return null;
  }),
  findServerForPath: jest.fn((path) => {
    if (path.includes('Projects\\test1')) {
      return { ...mockServers[0] };
    }
    return null;
  }),
}));

// 模拟terminal-manager
const mockTerminalManager = {
  createTerminal: jest.fn((name) => {
    const terminal = new vscode.window.createTerminal({ name });
    return terminal;
  }),
  getTerminal: jest.fn((name) => {
    return null; // 默认返回null，在测试中可以改变行为
  }),
  getAllTerminals: jest.fn(() => []),
  closeTerminal: jest.fn(),
};

jest.mock('../../../src/services/terminal-manager', () => mockTerminalManager);

// 导入模块
const sshService = require('../../../src/services/ssh-service');

describe('SSH Service Module', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  test('should connect to a server', async () => {
    // 准备
    const server = mockServers[0];
    const terminalName = `SSH: ${server.name}`;
    const mockTerminal = {
      name: terminalName,
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟终端管理器行为
    mockTerminalManager.createTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.connectToServer(server);
    
    // 验证
    expect(mockTerminalManager.createTerminal).toHaveBeenCalledWith(terminalName);
    expect(mockTerminal.sendText).toHaveBeenCalledWith(
      expect.stringContaining(`ssh ${server.username}@${server.host}`),
      true
    );
    expect(mockTerminal.show).toHaveBeenCalled();
  });

  test('should connect to a server with private key', async () => {
    // 准备
    const server = {
      ...mockServers[0],
      privateKey: '/path/to/key.pem',
    };
    const terminalName = `SSH: ${server.name}`;
    const mockTerminal = {
      name: terminalName,
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟终端管理器行为
    mockTerminalManager.createTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.connectToServer(server);
    
    // 验证
    expect(mockTerminalManager.createTerminal).toHaveBeenCalledWith(terminalName);
    expect(mockTerminal.sendText).toHaveBeenCalledWith(
      expect.stringContaining(`-i "${server.privateKey}"`),
      true
    );
    expect(mockTerminal.show).toHaveBeenCalled();
  });

  test('should execute init commands after connecting', async () => {
    // 准备
    const server = {
      ...mockServers[0],
      initCommands: ['cd /var/www', 'ls -la'],
    };
    const terminalName = `SSH: ${server.name}`;
    const mockTerminal = {
      name: terminalName,
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟终端管理器行为
    mockTerminalManager.createTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.connectToServer(server);
    
    // 验证
    expect(mockTerminal.sendText).toHaveBeenCalledTimes(3); // SSH命令 + 2个初始化命令
    expect(mockTerminal.sendText).toHaveBeenCalledWith('cd /var/www', true);
    expect(mockTerminal.sendText).toHaveBeenCalledWith('ls -la', true);
  });

  test('should send command to current terminal', async () => {
    // 准备
    const mockTerminal = {
      name: 'SSH: 测试服务器1',
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟当前终端
    mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.sendCommand('echo "hello"');
    
    // 验证
    expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "hello"', true);
    expect(mockTerminal.show).toHaveBeenCalled();
  });

  test('should create a new terminal if none exists', async () => {
    // 准备
    const mockTerminal = {
      name: 'SSH: 测试服务器1',
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟终端管理器行为 - 没有现有终端
    mockTerminalManager.getTerminal.mockReturnValue(null);
    mockTerminalManager.createTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.sendCommand('echo "hello"');
    
    // 验证
    expect(mockTerminalManager.createTerminal).toHaveBeenCalled();
    expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "hello"', true);
  });

  test('should change directory based on file path', async () => {
    // 准备
    const localPath = 'C:\\Projects\\test1\\src\\index.js';
    const remotePath = '/var/www/test1/src/index.js';
    const mockTerminal = {
      name: 'SSH: 测试服务器1',
      sendText: jest.fn(),
      show: jest.fn(),
    };
    
    // 模拟当前终端
    mockTerminalManager.getTerminal.mockReturnValue(mockTerminal);
    
    // 执行
    await sshService.changeDirectoryToFile(localPath);
    
    // 验证
    expect(mockTerminal.sendText).toHaveBeenCalledWith(`cd "${remotePath.substring(0, remotePath.lastIndexOf('/'))}"`, true);
    expect(mockTerminal.show).toHaveBeenCalled();
  });

  test('should return server list', () => {
    // 执行
    const servers = sshService.getServerList();
    
    // 验证
    expect(servers).toEqual(mockServers);
  });

  test('should return the current server', () => {
    // 准备
    const mockServer = mockServers[0];
    
    // 模拟有一个连接到当前服务器的终端
    mockTerminalManager.getAllTerminals.mockReturnValue([
      {
        name: `SSH: ${mockServer.name}`,
      },
    ]);
    
    // 执行
    const currentServer = sshService.getCurrentServer();
    
    // 验证
    expect(currentServer).toEqual(expect.objectContaining({
      name: mockServer.name,
    }));
  });
}); 