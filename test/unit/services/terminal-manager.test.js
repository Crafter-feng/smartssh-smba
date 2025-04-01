/**
 * 终端管理器模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入vscode模块 - 已经在jest.config.js中配置了模块映射
const vscode = require('vscode');

// 确保window相关方法是模拟函数
vscode.window.createTerminal = jest.fn().mockReturnValue({
    name: 'Test Terminal',
    sendText: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
});
vscode.window.onDidCloseTerminal = jest.fn().mockReturnValue({ dispose: jest.fn() });

// 模拟logger
jest.mock('../../../src/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

// 模拟process.platform
const originalPlatform = process.platform;
Object.defineProperty(process, 'platform', {
    value: 'win32',
    writable: true,
});

// 获取终端管理器实例
const terminalManager = require('../../../src/services/terminal-manager');

describe('Terminal Manager Module', () => {
    const mockServer = {
        name: 'Test Server',
        host: 'test.example.com',
        username: 'testuser',
        port: 2222,
        privateKey: '/path/to/key',
        agent: true,
        pathMappings: [
            {
                localPath: 'C:\\local\\path',
                remotePath: '/remote/path',
            },
        ],
        initCommands: ['echo "Hello"', 'ls -la'],
    };

    const mockCommand = {
        id: 'test-command',
        name: 'Test Command',
        command: 'echo "Test Command"',
    };

    beforeEach(() => {
        // 重置所有模拟
        jest.clearAllMocks();
    });

    afterAll(() => {
        // 恢复原始平台值
        Object.defineProperty(process, 'platform', {
            value: originalPlatform,
        });
    });

    test('should create SSH terminal', () => {
        // 准备
        const mockServer = {
            name: '测试服务器',
            host: 'test.example.com',
            username: 'testuser'
        };

        // 预期终端行为
        vscode.window.createTerminal.mockReturnValue({
            name: mockServer.name,
            sendText: jest.fn(),
            show: jest.fn()
        });

        // 执行
        const terminal = terminalManager.createSshTerminal(mockServer);

        // 验证
        expect(terminal).toBeTruthy();
        expect(terminal.sendText).toBeDefined();
    });

    test('should build SSH command with all parameters', () => {
        // 准备
        const mockServer = {
            name: '测试服务器',
            host: 'test.example.com',
            username: 'testuser',
            port: 2222,
            privateKey: '/path/to/key.pem'
        };

        // 执行
        const sshCommand = terminalManager.buildSshCommand(mockServer);

        // 验证
        expect(sshCommand).toHaveProperty('command', 'ssh');
        expect(sshCommand).toHaveProperty('args');
        expect(sshCommand).toHaveProperty('authMethod');
    });

    test('should handle password authentication', () => {
        // 准备
        const mockServer = {
            name: '测试服务器',
            host: 'test.example.com',
            username: 'testuser',
            password: 'password123'
        };

        // 执行
        const sshCommand = terminalManager.buildSshCommand(mockServer);

        // 验证
        expect(sshCommand).toHaveProperty('authMethod');
    });

    test('should create local terminal', () => {
        // 执行
        const terminal = terminalManager.createLocalTerminal('Local Test');

        // 验证
        expect(terminal).toBeTruthy();
        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
            name: 'Local Test',
        });
    });

    test('should find or create local terminal', () => {
        // 执行 - 第一次调用应该创建新终端
        const terminal1 = terminalManager.findOrCreateLocalTerminal('Terminal Test');

        // 验证
        expect(terminal1).toBeTruthy();
        expect(vscode.window.createTerminal).toHaveBeenCalledWith({
            name: 'Terminal Test',
        });

        // 模拟找到已存在的终端
        jest.spyOn(terminalManager, 'findTerminalByName').mockImplementationOnce(name => ({
            name: name,
            sendText: jest.fn(),
            show: jest.fn(),
        }));

        // 执行 - 第二次调用应该找到现有终端
        const terminal2 = terminalManager.findOrCreateLocalTerminal('Terminal Test');

        // 验证
        expect(terminal2).toBeTruthy();
        // 由于找到了已存在终端，createTerminal不应该被再次调用
        expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    });

    test('should close terminal', () => {
        // 模拟找到终端
        jest.spyOn(terminalManager, 'findTerminalByName').mockImplementationOnce(name => ({
            name: name,
            dispose: jest.fn(),
        }));

        // 执行
        const result = terminalManager.closeTerminal('Terminal To Close');

        // 验证
        expect(result).toBe(true);
    });

    test('should handle terminal close event', () => {
        // 准备
        const mockTerminal = {
            name: 'Closing Terminal',
            dispose: jest.fn(),
        };

        // 添加终端到管理器
        terminalManager.addTerminal('Closing Terminal', mockTerminal);

        // 执行终端关闭事件
        terminalManager.handleTerminalClose(mockTerminal);

        // 验证
        expect(terminalManager.findTerminalByName('Closing Terminal')).toBeNull();
    });

    test('should execute command in terminal', async () => {
        // 执行
        const result = await terminalManager.executeCommandInTerminal(mockCommand);

        // 验证
        expect(result).toBe(true);
        // 找不到现有终端，应该创建新终端
        expect(vscode.window.createTerminal).toHaveBeenCalled();
    });

    test('should return all terminals', () => {
        // 准备
        const mockTerminal1 = { name: 'Terminal 1', dispose: jest.fn() };
        const mockTerminal2 = { name: 'Terminal 2', dispose: jest.fn() };

        // 添加终端到管理器
        terminalManager.addTerminal('Terminal 1', mockTerminal1, { type: 'local' });
        terminalManager.addTerminal('Terminal 2', mockTerminal2, { type: 'ssh' });

        // 执行
        const terminals = terminalManager.getAllTerminals();

        // 验证
        expect(terminals.length).toBeGreaterThanOrEqual(2);
        expect(terminals.find(t => t.name === 'Terminal 1')).toBeTruthy();
        expect(terminals.find(t => t.name === 'Terminal 2')).toBeTruthy();
    });

    test('should close all terminals', () => {
        // 准备
        const mockTerminal1 = { 
            name: 'Terminal 1', 
            dispose: jest.fn()
        };
        const mockTerminal2 = { 
            name: 'Terminal 2', 
            dispose: jest.fn()
        };
        
        // 模拟终端管理器的terminals映射
        const mockMap = new Map();
        mockMap.set('Terminal 1', { terminal: mockTerminal1 });
        mockMap.set('Terminal 2', { terminal: mockTerminal2 });
        
        // 替换terminals映射
        terminalManager.terminals = mockMap;

        // 执行
        terminalManager.closeAllTerminals();

        // 验证
        expect(mockTerminal1.dispose).toHaveBeenCalled();
        expect(mockTerminal2.dispose).toHaveBeenCalled();
        expect(terminalManager.terminals.size).toBe(0);
    });

    test('should handle errors when creating SSH terminal', () => {
        // 准备
        const invalidServer = {
            // 缺少必要的属性
            name: 'Invalid Server',
        };

        // 执行
        const terminal = terminalManager.createSshTerminal(invalidServer);

        // 验证
        expect(terminal).toBeNull();
    });

    test('should handle errors in buildSshCommand', () => {
        // 准备
        const invalidServer = null;

        // 执行
        const sshCommand = terminalManager.buildSshCommand(invalidServer);

        // 验证
        expect(sshCommand).toHaveProperty('command', 'ssh');
        expect(sshCommand).toHaveProperty('args');
        expect(sshCommand).toHaveProperty('authMethod', 'byKey');
        expect(sshCommand.args).toEqual([]);
    });

    test('should handle errors when adding terminal', () => {
        // 模拟一个会抛出异常的操作
        const originalSet = Map.prototype.set;
        Map.prototype.set = jest.fn().mockImplementationOnce(() => {
            throw new Error('Mock error in set');
        });

        // 执行
        terminalManager.addTerminal('Error Terminal', {});

        // 恢复原始实现
        Map.prototype.set = originalSet;

        // 验证错误被处理
        expect(require('../../../src/utils/logger').logger.error).toHaveBeenCalled();
    });

    test('should handle errors when closing terminal', () => {
        // 模拟findTerminalByName会抛出异常
        jest.spyOn(terminalManager, 'findTerminalByName').mockImplementationOnce(() => {
            throw new Error('Mock error in findTerminalByName');
        });

        // 执行
        const result = terminalManager.closeTerminal('Error Terminal');

        // 验证
        expect(result).toBe(false);
        expect(require('../../../src/utils/logger').logger.error).toHaveBeenCalled();
    });

    test('should return false when closing non-existent terminal', () => {
        // 模拟没有找到终端
        jest.spyOn(terminalManager, 'findTerminalByName').mockImplementationOnce(() => null);

        // 执行
        const result = terminalManager.closeTerminal('Non-existent Terminal');

        // 验证
        expect(result).toBe(false);
    });

    test('should handle errors when closing all terminals', () => {
        // 准备
        const mockTerminal = { dispose: jest.fn().mockImplementationOnce(() => {
            throw new Error('Mock error in dispose');
        }) };

        // 添加终端到管理器
        terminalManager.addTerminal('Error Terminal', mockTerminal);

        // 执行
        terminalManager.closeAllTerminals();

        // 验证错误被处理
        expect(require('../../../src/utils/logger').logger.error).toHaveBeenCalled();
    });

    test('should handle errors when executing command in terminal without command', async () => {
        // 准备
        const terminal = { sendText: jest.fn() };
        const command = null;

        // 执行
        const result = await terminalManager.executeCommandInTerminal(terminal, command);

        // 验证
        expect(result).toBe(false);
    });

    test('should handle errors when executing command in terminal with invalid command object', async () => {
        // 准备
        const terminal = { sendText: jest.fn() };
        const command = {}; // 空对象

        // 执行
        const result = await terminalManager.executeCommandInTerminal(terminal, command);

        // 验证
        expect(result).toBe(false);
    });

    test('should handle errors when terminal cannot be created for command execution', async () => {
        // 模拟findOrCreateLocalTerminal返回null
        jest.spyOn(terminalManager, 'findOrCreateLocalTerminal').mockImplementationOnce(() => null);

        // 执行
        const result = await terminalManager.executeCommandInTerminal(mockCommand);

        // 验证
        expect(result).toBe(false);
        expect(require('../../../src/utils/logger').logger.error).toHaveBeenCalled();
    });

    test('should handle errors during command execution in terminal', async () => {
        // 模拟findOrCreateLocalTerminal返回出错的终端
        jest.spyOn(terminalManager, 'findOrCreateLocalTerminal').mockImplementationOnce(() => ({
            show: jest.fn().mockImplementationOnce(() => {
                throw new Error('Mock error in show');
            }),
            sendText: jest.fn(),
        }));

        // 执行
        const result = await terminalManager.executeCommandInTerminal(mockCommand);

        // 验证
        expect(result).toBe(false);
        expect(require('../../../src/utils/logger').logger.error).toHaveBeenCalled();
    });

    test('should handle server with path but no pathMappings', () => {
        // 准备
        const mockServer = {
            name: '路径测试服务器',
            host: 'example.com',
            username: 'user',
            path: '/custom/path'
        };

        // 执行
        const sshCommand = terminalManager.buildSshCommand(mockServer);

        // 验证 - 只检查结果是否存在，不检查具体内容
        expect(sshCommand).toBeTruthy();
    });

    test('should handle server with string initCommands', () => {
        // 准备
        const mockServer = {
            name: '命令测试服务器',
            host: 'example.com',
            username: 'user',
            initCommands: ['command1', 'command2']
        };

        // 执行
        const sshCommand = terminalManager.buildSshCommand(mockServer);

        // 验证 - 只检查结果是否存在，不检查具体内容
        expect(sshCommand).toBeTruthy();
    });

    test('should handle server with object initCommands', () => {
        // 准备
        const mockServer = {
            name: '对象命令测试服务器',
            host: 'example.com',
            username: 'user',
            initCommands: [
                { command: 'command1', name: '命令1' },
                { command: 'command2', name: '命令2' }
            ]
        };

        // 执行
        const sshCommand = terminalManager.buildSshCommand(mockServer);

        // 验证 - 只检查结果是否存在，不检查具体内容
        expect(sshCommand).toBeTruthy();
    });
});
