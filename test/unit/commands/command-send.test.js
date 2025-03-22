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
            showInformationMessage: jest.fn().mockResolvedValue('使用当前终端'),
            showQuickPick: jest.fn(),
            activeTerminal: null
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
const mockTerminal = {
    show: jest.fn(),
    sendText: jest.fn(),
};

jest.mock('../../../src/services/terminal-manager', () => {
    return {
        findTerminalByName: jest.fn().mockReturnValue(mockTerminal),
        findOrCreateLocalTerminal: jest.fn().mockReturnValue(mockTerminal),
        findTerminalsByServerName: jest.fn().mockReturnValue([]),
        getActiveSSHTerminal: jest.fn().mockReturnValue(null),
        getAllSSHTerminals: jest.fn().mockReturnValue([])
    };
});

// 模拟ssh-service
jest.mock('../../../src/services/ssh-service', () => {
    return {
        connectToServer: jest.fn().mockResolvedValue({
            success: true,
            terminal: mockTerminal,
            isNew: false
        })
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

// 模拟connection模块
jest.mock('../../../src/commands/connection', () => {
    return {
        openSSHConnection: jest.fn().mockResolvedValue(true),
        selectServer: jest.fn().mockResolvedValue('测试服务器')
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
const { logger } = require('../../../src/utils/logger');

// 导入命令模块
const commandModule = require('../../../src/commands/command');
const sendCommand = commandModule.sendCommand;

describe('Command Send Module Tests', () => {
    beforeEach(() => {
        // 清除所有模拟的模块
        jest.clearAllMocks();
        
        // 设置模拟终端管理器行为
        vscode.window.activeTerminal = null;
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

    test('应使用本地终端发送字符串命令', async () => {
        // 准备 - 直接传递字符串
        const commandString = 'echo "测试字符串命令"';

        // 执行
        await sendCommand(commandString);

        // 验证 - 当没有活动终端时应创建本地终端
        expect(terminalManager.findOrCreateLocalTerminal).toHaveBeenCalledWith('Command Terminal');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith(commandString);
    });

    test('应使用本地终端发送简单命令对象', async () => {
        // 准备 - 使用commandObj对象
        const commandItem = {
            commandObj: {
                command: 'npm run test',
                name: '运行测试'
            }
        };

        // 执行
        await sendCommand(commandItem);

        // 验证
        expect(terminalManager.findOrCreateLocalTerminal).toHaveBeenCalledWith('Command Terminal');
        expect(mockTerminal.show).toHaveBeenCalled();
        expect(mockTerminal.sendText).toHaveBeenCalledWith('npm run test');
    });

    test('应使用活动终端发送命令', async () => {
        // 准备 - 设置活动终端
        const activeTerminal = {
            show: jest.fn(),
            sendText: jest.fn()
        };
        vscode.window.activeTerminal = activeTerminal;

        const commandItem = {
            commandObj: 'git status'
        };

        // 执行
        await sendCommand(commandItem);

        // 验证 - 应使用活动终端
        expect(activeTerminal.show).toHaveBeenCalled();
        expect(activeTerminal.sendText).toHaveBeenCalledWith('git status');
        expect(terminalManager.findOrCreateLocalTerminal).not.toHaveBeenCalled();
    });

    test('应在连接服务器失败时显示错误', async () => {
        // 准备 - 服务器命令
        const serverName = '测试服务器';
        const commandItem = {
            contextValue: 'server-command',
            server: {
                name: serverName
            },
            command: 'echo "test"'
        };

        // 模拟连接失败 - 需要从模拟的connection模块中抛出错误
        require('../../../src/commands/connection').openSSHConnection.mockRejectedValueOnce(
            new Error('连接失败')
        );

        // 执行
        await sendCommand(commandItem);

        // 验证 - 应显示错误消息
        expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });
}); 