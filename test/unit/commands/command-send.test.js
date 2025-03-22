/**
 * 命令发送功能测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 模拟vscode模块
jest.mock('vscode', () => {
    return {
        window: {
            showErrorMessage: jest.fn(),
            showInformationMessage: jest.fn(),
        },
        commands: {
            executeCommand: jest.fn().mockImplementation(() => Promise.resolve()),
        },
        workspace: {
            onDidChangeConfiguration: jest.fn().mockImplementation(() => {
                return { dispose: jest.fn() };
            }),
            getConfiguration: jest.fn().mockImplementation(() => {
                return {
                    get: jest.fn(),
                    update: jest.fn(),
                    has: jest.fn(),
                };
            }),
        },
        EventEmitter: jest.fn().mockImplementation(() => ({
            event: null,
            fire: jest.fn(),
        })),
    };
});

// 模拟configLoader以避免依赖问题
jest.mock('../../../src/adapters/config-loader', () => {
    return {
        getCommandList: jest.fn(),
        getServerList: jest.fn(),
        refreshCache: jest.fn(),
    };
});

// 模拟terminalManager
jest.mock('../../../src/services/terminal-manager', () => {
    return {
        findTerminalByName: jest.fn(),
        findOrCreateLocalTerminal: jest.fn(),
    };
});

// 模拟ssh-service
jest.mock('../../../src/services/ssh-service', () => {
    return {
        connectToServer: jest.fn()
    };
});

// 模拟日志
jest.mock('../../../src/utils/logger', () => {
    return {
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
    };
});

// 模拟命令树提供者
jest.mock('../../../src/ui/tree-view/command-provider', () => {
    return {
        refresh: jest.fn(),
    };
});

// 导入需要测试的模块和依赖
const vscode = require('vscode');
const terminalManager = require('../../../src/services/terminal-manager');
const sshService = require('../../../src/services/ssh-service');
const { logger } = require('../../../src/utils/logger');

// 导入命令模块
const commandModule = require('../../../src/commands/command');
const sendCommand = commandModule.sendCommand;

describe('Command Send Module Tests', () => {
    // 模拟终端对象
    const mockTerminal = {
        show: jest.fn(),
        sendText: jest.fn(),
    };

    beforeEach(() => {
        // 清除所有模拟的模块
        jest.clearAllMocks();
        // 设置默认的本地终端返回值
        terminalManager.findOrCreateLocalTerminal.mockReturnValue(mockTerminal);
    });

    test('应正确处理全局命令项', async () => {
        // 准备
        const commandItem = {
            command: {
                name: '测试命令',
                command: 'echo "测试"',
                description: '测试描述',
            },
            contextValue: 'global-command',
        };

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findOrCreateLocalTerminal).toHaveBeenCalledWith('Command Terminal');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "测试"');
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    test('应正确处理工作区命令项', async () => {
        // 准备
        const commandItem = {
            command: {
                name: '工作区命令',
                command: 'npm run dev',
                description: '启动开发服务器',
            },
            contextValue: 'workspace-command',
        };

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findOrCreateLocalTerminal).toHaveBeenCalledWith('Command Terminal');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith('npm run dev');
    });

    test('应正确处理服务器初始化命令项', async () => {
        // 准备
        const commandItem = {
            command: 'cd /var/www && ls -la',
            contextValue: 'init-command',
            server: {
                name: '测试服务器',
                host: 'example.com',
                username: 'testuser',
            },
        };

        // 模拟没有现有终端
        terminalManager.findTerminalByName.mockReturnValue(null);
        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findTerminalByName).toHaveBeenCalledWith('测试服务器');
        expect(sshService.connectToServer).toHaveBeenCalledWith('测试服务器');
        expect(logger.info).toHaveBeenCalledWith('服务器 测试服务器 未连接，正在连接...');
    });

    test('应正确处理服务器自定义命令项', async () => {
        // 准备
        const commandItem = {
            server: {
                name: '测试服务器',
                host: 'example.com',
                username: 'testuser',
            },
            contextValue: 'custom-command',
            command: {
                name: '自定义命令',
                command: 'ps aux | grep node',
                description: '查看Node进程',
            },
        };

        // 模拟已有终端
        terminalManager.findTerminalByName.mockReturnValue(mockTerminal);
        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findTerminalByName).toHaveBeenCalledWith('测试服务器');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith('ps aux | grep node');
        expect(logger.info).toHaveBeenCalledWith(
            '已发送命令到服务器 测试服务器: ps aux | grep node'
        );
    });

    test('应正确处理旧格式的命令对象', async () => {
        // 准备 - 使用旧格式的commandObj
        const commandItem = {
            commandObj: {
                command: 'echo "旧格式命令"',
                name: '旧命令',
            },
        };

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(mockTerminal.sendText).toHaveBeenCalledWith('echo "旧格式命令"');
    });

    test('应处理无效的命令输入', async () => {
        // 准备 - 空命令项
        const commandItem = {};

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('无效的命令或命令为空');
        expect(mockTerminal.sendText).not.toHaveBeenCalled();
    });

    it('应在连接服务器失败时显示错误', async () => {
        // 准备
        const serverName = '失败服务器';
        const commandItem = {
            contextValue: 'server-command',
            server: {
                name: serverName
            },
            command: 'echo "test"',
        };

        // 确保没有之前的错误消息调用
        vscode.window.showErrorMessage.mockClear();

        // 模拟连接失败 - 模拟实际实现方式：抛出错误并显示错误消息
        sshService.connectToServer.mockImplementationOnce(server => {
            // 首先抛出错误
            const error = new Error('连接失败');
            // 抛出之前不返回任何内容，而是直接抛出
            throw error;
        });

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            `连接到服务器 ${serverName} 失败: 连接失败`
        );
    });

    it('应处理未找到服务器终端的情况', async () => {
        // 准备
        const serverName = '找不到终端服务器';
        const commandItem = {
            contextValue: 'server-command',
            server: {
                name: serverName
            },
            command: 'echo "test"',
        };

        const terminalManager = require('../../../src/services/terminal-manager');
        const sshService = require('../../../src/services/ssh-service');

        // 确保没有之前的错误消息调用
        vscode.window.showErrorMessage.mockClear();

        // 重置所有模拟的模块
        jest.clearAllMocks();

        // 模拟连接成功
        sshService.connectToServer.mockImplementationOnce(() => {
            return Promise.resolve({ success: true });
        });

        // 模拟等待终端创建（使setTimeout立即执行回调）
        jest.spyOn(global, 'setTimeout').mockImplementationOnce(callback => {
            callback();
            return 999;
        });

        // 确保findTerminalByName总是返回null（即找不到终端）
        terminalManager.findTerminalByName.mockReturnValue(null);

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findTerminalByName).toHaveBeenCalledWith(serverName);

        // 验证显示错误消息
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            `无法找到服务器 ${serverName} 的终端`
        );
    });
}); 