/**
 * Jest测试全局设置文件
 */

// 设置全局测试环境变量
process.env.NODE_ENV = 'test';

// 定义全局Jest对象和匹配器
global.jest = jest;
global.expect = expect;
global.test = test;
global.describe = describe;
global.beforeEach = beforeEach;
global.afterEach = afterEach;
global.beforeAll = beforeAll;
global.afterAll = afterAll;

// 模拟console对象
global.console = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// 添加ESLint注释到所有测试文件头部，声明全局变量
// 这个只是注释，不会真正影响文件内容，但可以作为提示
/*
以下注释应该添加到所有测试文件头部：

/ *eslint-env jest* /
/ *global jest, expect, test, describe, beforeEach, afterEach, beforeAll, afterAll* /
*/

// vscode对象的模拟通过moduleNameMapper在jest.config.js中配置
