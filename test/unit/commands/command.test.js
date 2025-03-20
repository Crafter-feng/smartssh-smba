/**
 * 命令模块单元测试
 */
const vscode = require('../../mocks/vscode');
const { mockCommands, mockWorkspaceCommands } = require('../../mocks/config');

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
const mockConfigLoader = {
  getGlobalCommands: jest.fn(() => [...mockCommands]),
  getWorkspaceCommands: jest.fn(() => [...mockWorkspaceCommands]),
  addCommand: jest.fn(() => Promise.resolve()),
  updateCommand: jest.fn(() => Promise.resolve()),
  removeCommand: jest.fn(() => Promise.resolve()),
  refreshCache: jest.fn(),
};

jest.mock('../../../src/adapters/config-loader', () => mockConfigLoader);

// 模拟SSH服务
const mockSshService = {
  sendCommand: jest.fn(() => Promise.resolve()),
  getCurrentServer: jest.fn(() => ({ name: '测试服务器1' })),
};

jest.mock('../../../src/services/ssh-service', () => mockSshService);

// 导入模块
const commandModule = require('../../../src/commands/command');

describe('Command Module', () => {
  const mockContext = {
    subscriptions: [],
  };
  
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 重置模拟输入框交互
    vscode.window.showInputBox.mockImplementation((options) => {
      if (options.prompt.includes('名称')) return Promise.resolve('测试命令');
      if (options.prompt.includes('命令')) return Promise.resolve('echo "test"');
      if (options.prompt.includes('描述')) return Promise.resolve('测试描述');
      return Promise.resolve('');
    });
    
    // 重置模拟选择框交互
    vscode.window.showQuickPick.mockImplementation((items) => {
      return Promise.resolve(items[0]);
    });
  });

  test('should register all command related commands', () => {
    // 执行
    commandModule.register(mockContext);
    
    // 验证
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'smartssh-smba.sendCommand',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'smartssh-smba.addCommand',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'smartssh-smba.editCommand',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'smartssh-smba.deleteCommand',
      expect.any(Function)
    );
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'smartssh-smba.refreshCommandList',
      expect.any(Function)
    );
  });

  test('should add a new global command', async () => {
    // 准备
    const addCommandHandler = jest.fn();
    vscode.commands.registerCommand.mockImplementation((name, callback) => {
      if (name === 'smartssh-smba.addGlobalCommand') {
        addCommandHandler.mockImplementation(callback);
      }
      return { dispose: jest.fn() };
    });
    
    // 注册命令
    commandModule.register(mockContext);
    
    // 执行
    await addCommandHandler();
    
    // 验证
    expect(mockConfigLoader.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '测试命令',
        command: 'echo "test"',
        description: '测试描述',
      }),
      'global'
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('已添加命令')
    );
  });

  test('should send a command to the current SSH session', async () => {
    // 准备
    const sendCommandHandler = jest.fn();
    vscode.commands.registerCommand.mockImplementation((name, callback) => {
      if (name === 'smartssh-smba.sendCommand') {
        sendCommandHandler.mockImplementation(callback);
      }
      return { dispose: jest.fn() };
    });
    
    // 模拟命令项
    const commandItem = {
      command: {
        name: '列出文件',
        command: 'ls -la',
      },
    };
    
    // 注册命令
    commandModule.register(mockContext);
    
    // 执行
    await sendCommandHandler(commandItem);
    
    // 验证
    expect(mockSshService.sendCommand).toHaveBeenCalledWith(
      commandItem.command.command
    );
  });

  test('should edit an existing command', async () => {
    // 准备
    const editCommandHandler = jest.fn();
    vscode.commands.registerCommand.mockImplementation((name, callback) => {
      if (name === 'smartssh-smba.editCommand') {
        editCommandHandler.mockImplementation(callback);
      }
      return { dispose: jest.fn() };
    });
    
    // 模拟命令项
    const commandItem = {
      command: mockCommands[0],
      type: 'global',
    };
    
    // 注册命令
    commandModule.register(mockContext);
    
    // 执行
    await editCommandHandler(commandItem);
    
    // 验证
    expect(mockConfigLoader.updateCommand).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('已更新命令')
    );
  });

  test('should delete a command', async () => {
    // 准备
    const deleteCommandHandler = jest.fn();
    vscode.commands.registerCommand.mockImplementation((name, callback) => {
      if (name === 'smartssh-smba.deleteCommand') {
        deleteCommandHandler.mockImplementation(callback);
      }
      return { dispose: jest.fn() };
    });
    
    // 模拟命令项
    const commandItem = {
      command: mockCommands[0],
      type: 'global',
    };
    
    // 模拟确认对话框
    vscode.window.showInformationMessage.mockImplementation((message, ...items) => {
      return Promise.resolve(items.find(item => item.title === '确认'));
    });
    
    // 注册命令
    commandModule.register(mockContext);
    
    // 执行
    await deleteCommandHandler(commandItem);
    
    // 验证
    expect(mockConfigLoader.removeCommand).toHaveBeenCalled();
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  test('should refresh command list', async () => {
    // 准备
    const refreshCommandListHandler = jest.fn();
    vscode.commands.registerCommand.mockImplementation((name, callback) => {
      if (name === 'smartssh-smba.refreshCommandList') {
        refreshCommandListHandler.mockImplementation(callback);
      }
      return { dispose: jest.fn() };
    });
    
    // 注册命令
    commandModule.register(mockContext);
    
    // 创建一个模拟的树视图提供者
    const provider = {
      refresh: jest.fn(),
    };
    
    // 执行
    await refreshCommandListHandler(provider);
    
    // 验证
    expect(mockConfigLoader.refreshCache).toHaveBeenCalled();
    expect(provider.refresh).toHaveBeenCalled();
  });
}); 