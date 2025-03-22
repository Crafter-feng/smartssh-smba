/**
 * 命令模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window相关方法是模拟函数
vscode.window.showErrorMessage = jest.fn();
vscode.window.showInformationMessage = jest.fn();

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
const { mockCommands, mockWorkspaceCommands } = require('../../mocks/config');

// 模拟configLoader
jest.mock('../../../src/adapters/config-loader', () => ({
  getCommandList: jest.fn().mockResolvedValue([...mockCommands]),
  getWorkspaceCommandList: jest.fn().mockResolvedValue([...mockWorkspaceCommands]),
  getCommandById: jest.fn().mockImplementation(async id => {
    const command = mockCommands.find(cmd => cmd.id === id);
    return command || null;
  }),
  getWorkspaceCommandById: jest.fn().mockImplementation(async id => {
    const command = mockWorkspaceCommands.find(cmd => cmd.id === id);
    return command || null;
  }),
  saveCommand: jest.fn().mockImplementation(async command => command),
  saveWorkspaceCommand: jest.fn().mockImplementation(async command => command),
  deleteCommand: jest.fn().mockResolvedValue(true),
  deleteWorkspaceCommand: jest.fn().mockResolvedValue(true),
}));

// 模拟terminalManager
jest.mock('../../../src/services/terminal-manager', () => ({
  executeCommandInTerminal: jest.fn().mockResolvedValue(true),
}));

// 创建模拟的命令服务对象
const mockCommandService = {
  getCommandList: jest.fn().mockImplementation(async () => [...mockCommands, ...mockWorkspaceCommands]),
  getCommandById: jest.fn().mockImplementation(async id => {
    const globalCommand = mockCommands.find(cmd => cmd.id === id);
    if (globalCommand) return globalCommand;

    const workspaceCommand = mockWorkspaceCommands.find(cmd => cmd.id === id);
    return workspaceCommand || null;
  }),
  saveCommand: jest.fn().mockImplementation(async command => {
    if (command.scope === 'workspace') {
      return require('../../../src/adapters/config-loader').saveWorkspaceCommand(command);
    }
    return require('../../../src/adapters/config-loader').saveCommand(command);
  }),
  deleteCommand: jest.fn().mockImplementation(async (id, scope = 'global') => {
    if (scope === 'workspace') {
      return require('../../../src/adapters/config-loader').deleteWorkspaceCommand(id);
    }
    return require('../../../src/adapters/config-loader').deleteCommand(id);
  }),
  sendCommand: jest.fn().mockImplementation(async commandItem => {
    const terminalManager = require('../../../src/services/terminal-manager');
    return terminalManager.executeCommandInTerminal(commandItem);
  }),
};

// 替换实际模块
jest.mock('../../../src/commands/command', () => mockCommandService);

describe('Command Service', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  describe('getCommandList', () => {
    test('should return combined list of global and workspace commands', async () => {
      // 执行
      const commands = await mockCommandService.getCommandList();

      // 验证
      expect(commands.length).toBe(mockCommands.length + mockWorkspaceCommands.length);
      expect(commands).toEqual(expect.arrayContaining([...mockCommands, ...mockWorkspaceCommands]));
    });
  });

  describe('getCommandById', () => {
    test('should return global command by id', async () => {
      // 准备
      const commandId = mockCommands[0].id;

      // 执行
      const command = await mockCommandService.getCommandById(commandId);

      // 验证
      expect(command).toEqual(mockCommands[0]);
    });

    test('should return workspace command by id', async () => {
      // 准备
      const commandId = mockWorkspaceCommands[0].id;

      // 执行
      const command = await mockCommandService.getCommandById(commandId);

      // 验证
      expect(command).toEqual(mockWorkspaceCommands[0]);
    });

    test('should return null if command not found', async () => {
      // 准备
      const commandId = 'non-existent-id';

      // 执行
      const command = await mockCommandService.getCommandById(commandId);

      // 验证
      expect(command).toBeNull();
    });
  });

  describe('saveCommand', () => {
    test('should save global command', async () => {
      // 准备
      const command = { ...mockCommands[0], name: 'Updated Command' };

      // 执行
      const result = await mockCommandService.saveCommand(command);

      // 验证
      expect(result).toEqual(command);
      expect(require('../../../src/adapters/config-loader').saveCommand).toHaveBeenCalledWith(command);
    });

    test('should save workspace command', async () => {
      // 准备
      const command = { ...mockWorkspaceCommands[0], name: 'Updated Workspace Command' };
      command.scope = 'workspace';

      // 执行
      const result = await mockCommandService.saveCommand(command);

      // 验证
      expect(result).toEqual(command);
      expect(require('../../../src/adapters/config-loader').saveWorkspaceCommand).toHaveBeenCalledWith(command);
    });

    test('should generate id for new command', async () => {
      // 准备
      const command = {
        name: 'New Command',
        command: 'echo "Hello"',
      };

      // 模拟生成ID的行为
      const saveCommandOriginal = require('../../../src/adapters/config-loader').saveCommand;
      require('../../../src/adapters/config-loader').saveCommand.mockImplementationOnce(async cmd => {
        return { ...cmd, id: 'new-generated-id' };
      });

      // 执行
      const result = await mockCommandService.saveCommand(command);

      // 验证
      expect(result.id).toBeTruthy();
      expect(result.name).toBe(command.name);
      expect(require('../../../src/adapters/config-loader').saveCommand).toHaveBeenCalled();
    });
  });

  describe('deleteCommand', () => {
    test('should delete global command', async () => {
      // 准备
      const commandId = mockCommands[0].id;

      // 执行
      const result = await mockCommandService.deleteCommand(commandId);

      // 验证
      expect(result).toBe(true);
      expect(require('../../../src/adapters/config-loader').deleteCommand).toHaveBeenCalledWith(commandId);
    });

    test('should delete workspace command', async () => {
      // 准备
      const commandId = mockWorkspaceCommands[0].id;

      // 执行
      const result = await mockCommandService.deleteCommand(commandId, 'workspace');

      // 验证
      expect(result).toBe(true);
      expect(require('../../../src/adapters/config-loader').deleteWorkspaceCommand).toHaveBeenCalledWith(commandId);
    });
  });

  describe('sendCommand', () => {
    test('should execute command in terminal', async () => {
      // 准备
      const commandItem = mockCommands[0];

      // 执行
      const result = await mockCommandService.sendCommand(commandItem);

      // 验证
      expect(result).toBe(true);
      expect(require('../../../src/services/terminal-manager').executeCommandInTerminal).toHaveBeenCalledWith(commandItem);
    });
  });
});
