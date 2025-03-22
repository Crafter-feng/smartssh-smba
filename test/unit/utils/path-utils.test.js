/**
 * path-utils 模块单元测试
 */
/* eslint-env jest */
/* global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll */

// 导入需要的模块
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const configLoader = require('../../../src/adapters/config-loader');
const { logger } = require('../../../src/utils/logger');

// 在测试前保存原始模块
const originalFs = { ...fs };

// 模拟依赖模块
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: {
          fsPath: '/workspace/root'
        }
      }
    ]
  }
}));

jest.mock('fs', () => ({
  promises: {
    access: jest.fn()
  }
}));

jest.mock('../../../src/adapters/config-loader', () => ({
  getServerList: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    functionStart: jest.fn(),
    functionEnd: jest.fn()
  },
  logPathConversion: jest.fn()
}));

// 导入被测试模块 (在mock之后导入，确保使用的是mock版本)
const pathUtils = require('../../../src/utils/path-utils');

describe('路径工具模块 (path-utils)', () => {
  // 在每个测试之前重置所有模拟
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =============================================================================
  // 路径标准化和基础处理
  // =============================================================================
  describe('normalizePath', () => {
    test('应该处理空路径', () => {
      expect(pathUtils.normalizePath(null)).toBe('');
      expect(pathUtils.normalizePath('')).toBe('');
      expect(pathUtils.normalizePath(undefined)).toBe('');
    });

    test('应该标准化Windows路径', () => {
      expect(pathUtils.normalizePath('C:\\Users\\test')).toBe('C:/Users/test/');
      expect(pathUtils.normalizePath('c:\\users\\test')).toBe('C:/users/test/');
    });

    test('应该标准化Unix路径', () => {
      expect(pathUtils.normalizePath('/home/user')).toBe('/home/user/');
      expect(pathUtils.normalizePath('/home/user/')).toBe('/home/user/');
    });

    test('应该处理多重斜杠', () => {
      expect(pathUtils.normalizePath('/home//user///test')).toBe('/home/user/test/');
      expect(pathUtils.normalizePath('C:\\\\Users\\\\test')).toBe('C:/Users/test/');
    });

    test('应该处理网络路径', () => {
      expect(pathUtils.normalizePath('//server/share')).toBe('//server/share/');
      expect(pathUtils.normalizePath('//server//share')).toBe('//server/share/');
    });
  });

  describe('extractFileInfo', () => {
    test('应该从路径提取文件信息', () => {
      const result = pathUtils.extractFileInfo('/path/to/file.txt:42:5');
      expect(result.fileName).toBe('file.txt');
      expect(result.line).toBe(42);
      expect(result.column).toBe(5);
    });

    test('应该处理只有行号的路径', () => {
      const result = pathUtils.extractFileInfo('/path/to/file.txt:42');
      expect(result.fileName).toBe('file.txt');
      expect(result.line).toBe(42);
      expect(result.column).toBeUndefined();
    });

    test('应该处理没有行号和列号的路径', () => {
      const result = pathUtils.extractFileInfo('/path/to/file.txt');
      expect(result.fileName).toBe('file.txt');
      expect(result.line).toBeUndefined();
      expect(result.column).toBeUndefined();
    });

    test('应该处理非字符串输入', () => {
      const result = pathUtils.extractFileInfo(null);
      expect(result.fileName).toBe('null');
      expect(result.line).toBeUndefined();
      expect(result.column).toBeUndefined();
    });
  });

  describe('checkPathExists', () => {
    test('应该返回true当路径存在', async () => {
      fs.promises.access.mockResolvedValue(undefined);
      const result = await pathUtils.checkPathExists('/path/to/file.txt');
      expect(result).toBe(true);
      expect(fs.promises.access).toHaveBeenCalledWith('/path/to/file.txt');
    });

    test('应该返回false当路径不存在', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      const result = await pathUtils.checkPathExists('/path/to/nonexistent.txt');
      expect(result).toBe(false);
      expect(fs.promises.access).toHaveBeenCalledWith('/path/to/nonexistent.txt');
    });
  });

  // =============================================================================
  // 路径映射处理
  // =============================================================================
  describe('getPathMappings', () => {
    test('应该返回空数组如果server为空', () => {
      expect(pathUtils.getPathMappings(null)).toEqual([]);
      expect(pathUtils.getPathMappings(undefined)).toEqual([]);
    });

    test('应该返回pathMappings数组', () => {
      const server = {
        name: 'testServer',
        pathMappings: [
          { localPath: '/local/path1', remotePath: '/remote/path1' },
          { localPath: '/local/path2', remotePath: '/remote/path2' }
        ]
      };
      expect(pathUtils.getPathMappings(server)).toEqual(server.pathMappings);
    });

    test('应该处理旧的smbMapping格式', () => {
      const server = {
        name: 'testServer',
        smbMapping: { localPath: '/local/path', remotePath: '/remote/path' }
      };
      expect(pathUtils.getPathMappings(server)).toEqual([server.smbMapping]);
    });

    test('应该同时处理新旧格式', () => {
      const server = {
        name: 'testServer',
        pathMappings: [
          { localPath: '/local/path1', remotePath: '/remote/path1' },
        ],
        smbMapping: { localPath: '/local/path2', remotePath: '/remote/path2' }
      };
      expect(pathUtils.getPathMappings(server)).toEqual([
        ...server.pathMappings,
        server.smbMapping
      ]);
    });
  });

  describe('convertRemotePathToLocal', () => {
    const server = {
      name: 'testServer',
      pathMappings: [
        { localPath: 'C:/Projects', remotePath: '/home/user/projects' },
        { localPath: 'D:/Data', remotePath: '/var/data' }
      ]
    };

    test('应该处理无效参数', () => {
      expect(pathUtils.convertRemotePathToLocal(null, server)).toBeNull();
      expect(pathUtils.convertRemotePathToLocal('', server)).toBeNull();
      expect(pathUtils.convertRemotePathToLocal('/path', null)).toBeNull();
    });

    test('应该转换远程路径到本地路径', () => {
      const result = pathUtils.convertRemotePathToLocal('/home/user/projects/file.txt', server);
      expect(result).toBe('C:/Projects/file.txt/');
    });

    test('应该使用最匹配的映射', () => {
      const complexServer = {
        name: 'complexServer',
        pathMappings: [
          { localPath: 'C:/Projects', remotePath: '/home/user/projects' },
          { localPath: 'C:/Projects/webapp', remotePath: '/home/user/projects/webapp' }
        ]
      };
      
      const result = pathUtils.convertRemotePathToLocal('/home/user/projects/webapp/index.js', complexServer);
      expect(result).toBe('C:/Projects/webapp/index.js/');
    });

    test('应该返回null当没有匹配的映射', () => {
      expect(pathUtils.convertRemotePathToLocal('/etc/config', server)).toBeNull();
    });
  });

  describe('convertLocalPathToRemote', () => {
    const server = {
      name: 'testServer',
      pathMappings: [
        { localPath: 'C:/Projects', remotePath: '/home/user/projects' },
        { localPath: 'D:/Data', remotePath: '/var/data' }
      ]
    };

    test('应该处理无效参数', () => {
      expect(pathUtils.convertLocalPathToRemote(null, server)).toBeNull();
      expect(pathUtils.convertLocalPathToRemote('', server)).toBeNull();
      expect(pathUtils.convertLocalPathToRemote('C:/path', null)).toBeNull();
    });

    test('应该转换本地路径到远程路径', () => {
      const result = pathUtils.convertLocalPathToRemote('C:/Projects/file.txt', server);
      expect(result).toBe('/home/user/projects/file.txt/');
    });

    test('应该使用最匹配的映射', () => {
      const complexServer = {
        name: 'complexServer',
        pathMappings: [
          { localPath: 'C:/Projects', remotePath: '/home/user/projects' },
          { localPath: 'C:/Projects/webapp', remotePath: '/home/user/projects/webapp' }
        ]
      };
      
      const result = pathUtils.convertLocalPathToRemote('C:/Projects/webapp/index.js', complexServer);
      expect(result).toBe('/home/user/projects/webapp/index.js/');
    });

    test('应该返回null当没有匹配的映射', () => {
      expect(pathUtils.convertLocalPathToRemote('E:/other/path', server)).toBeNull();
    });
  });

  // =============================================================================
  // 服务器匹配
  // =============================================================================
  describe('findServerForPath', () => {
    const servers = [
      {
        name: 'server1',
        pathMappings: [
          { localPath: 'C:/Projects/app1', remotePath: '/home/user/app1' }
        ]
      },
      {
        name: 'server2',
        pathMappings: [
          { localPath: 'C:/Projects/app2', remotePath: '/home/user/app2' }
        ]
      }
    ];

    beforeEach(() => {
      configLoader.getServerList.mockReturnValue(servers);
    });

    test('应该匹配正确的服务器', () => {
      const result = pathUtils.findServerForPath('C:/Projects/app1/index.js');
      expect(result).toEqual(servers[0]);
    });

    test('应该返回null当没有匹配的服务器', () => {
      expect(pathUtils.findServerForPath('D:/OtherPath/file.txt')).toBeNull();
    });

    test('应该处理空路径', () => {
      expect(pathUtils.findServerForPath(null)).toBeNull();
      expect(pathUtils.findServerForPath('')).toBeNull();
    });

    test('应该处理空服务器列表', () => {
      configLoader.getServerList.mockReturnValue([]);
      expect(pathUtils.findServerForPath('C:/Projects/app1/index.js')).toBeNull();
    });
  });

  describe('findServerForPathDetailed', () => {
    const servers = [
      {
        name: 'server1',
        pathMappings: [
          { localPath: 'C:/Projects/app1', remotePath: '/home/user/app1' }
        ]
      },
      {
        name: 'server2',
        pathMappings: [
          { localPath: 'C:/Projects/app2', remotePath: '/home/user/app2' }
        ]
      }
    ];

    beforeEach(() => {
      configLoader.getServerList.mockReturnValue(servers);
    });

    test('应该返回详细的匹配信息', () => {
      const result = pathUtils.findServerForPathDetailed('C:/Projects/app1/index.js');
      expect(result).toHaveProperty('server', servers[0]);
      expect(result).toHaveProperty('mapping', servers[0].pathMappings[0]);
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('result', true);
    });

    test('应该返回null当没有匹配的服务器', () => {
      expect(pathUtils.findServerForPathDetailed('D:/OtherPath/file.txt')).toBeNull();
    });
  });

  // =============================================================================
  // 路径识别和提取
  // =============================================================================
  describe('findPotentialPaths', () => {
    test('应该识别Unix风格的路径', () => {
      const text = 'Check the file at /usr/local/bin/app.js:42:5';
      const results = pathUtils.findPotentialPaths(text);
      
      expect(results.length).toBeGreaterThan(0);
      const unixPath = results.find(r => r.isUnix);
      expect(unixPath).toBeDefined();
      expect(unixPath.path).toBe('/usr/local/bin/app.js');
      expect(unixPath.line).toBe(42);
      expect(unixPath.column).toBe(5);
      expect(unixPath.type).toBe('unix');
    });

    test('应该识别相对路径', () => {
      const text = 'Check the files at ./app.js and ../lib/utils.js';
      const results = pathUtils.findPotentialPaths(text);
      
      expect(results.length).toBeGreaterThan(0);
      const relativePaths = results.filter(r => r.isRelative);
      expect(relativePaths.length).toBe(2);
      
      expect(relativePaths[0].path).toBe('./app.js');
      expect(relativePaths[1].path).toBe('../lib/utils.js');
    });

    test('应该识别CMake错误格式', () => {
      const text = 'app.cpp(42,15): error C2065: undeclared identifier';
      const results = pathUtils.findPotentialPaths(text);
      
      expect(results.length).toBeGreaterThan(0);
      const cmakePath = results.find(r => r.type === 'cmake');
      expect(cmakePath).toBeDefined();
      expect(cmakePath.path).toBe('app.cpp');
      expect(cmakePath.line).toBe(42);
      expect(cmakePath.column).toBe(15);
    });

    test('应该识别Make/GCC错误格式', () => {
      const text = 'app.cpp:42:15: error: undeclared identifier';
      const results = pathUtils.findPotentialPaths(text);
      
      expect(results.length).toBeGreaterThan(0);
      const makePath = results.find(r => r.type === 'make');
      expect(makePath).toBeDefined();
      expect(makePath.path).toBe('app.cpp');
      expect(makePath.line).toBe(42);
      expect(makePath.column).toBe(15);
    });

    test('应该跳过URL', () => {
      const text = 'Check http://example.com/path/to/file.js and /usr/local/bin/app.js';
      const results = pathUtils.findPotentialPaths(text);
      
      // URL不应该被识别为路径
      const urlPath = results.find(r => r.path.includes('example.com'));
      expect(urlPath).toBeUndefined();
      
      // 但应该识别出其他路径
      const unixPath = results.find(r => r.isUnix);
      expect(unixPath).toBeDefined();
      expect(unixPath.path).toBe('/usr/local/bin/app.js');
    });
  });

  // =============================================================================
  // 终端路径提取与处理
  // =============================================================================
  describe('processPathsFromText', () => {
    const server = {
      name: 'testServer',
      pathMappings: [
        { localPath: 'C:/Projects', remotePath: '/home/user/projects' }
      ],
      currentWorkingDirectory: '/home/user/projects/webapp'
    };

    test('应该处理无效参数', () => {
      expect(pathUtils.processPathsFromText(null, server)).toEqual([]);
      expect(pathUtils.processPathsFromText('', server)).toEqual([]);
      expect(pathUtils.processPathsFromText('text', null)).toEqual([]);
    });

    test('应该处理Unix绝对路径', () => {
      const text = 'Check the file at /home/user/projects/app.js';
      const results = pathUtils.processPathsFromText(text, server);
      
      expect(results.length).toBeGreaterThan(0);
      const processedPath = results.find(r => r.localPath);
      expect(processedPath).toBeDefined();
      expect(processedPath.path).toBe('/home/user/projects/app.js');
      expect(processedPath.localPath).toBe('C:/Projects/app.js/');
    });

    test('应该处理相对路径', () => {
      const text = 'Check the file at ./app.js';
      const results = pathUtils.processPathsFromText(text, server);
      
      expect(results.length).toBeGreaterThan(0);
      // 找到第一个有localPath的结果
      const processedPath = results.find(r => r.localPath);
      
      // 应该转换为本地路径
      expect(processedPath).toBeDefined();
      // 根据当前工作目录和相对路径构建了完整路径
      expect(processedPath.path).toBe('./app.js');
    });
  });
}); 