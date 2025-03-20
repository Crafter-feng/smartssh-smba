/**
 * Jest配置文件
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/extension.js', // 入口文件需要vscode API，不适合单元测试
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // 设置测试模块解析别名，以避免相对路径过长
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  // 在每个测试文件之前设置全局变量和模拟
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
}; 