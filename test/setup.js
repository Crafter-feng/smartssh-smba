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

// vscode对象的模拟在各测试文件中单独导入 