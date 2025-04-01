/**
 * Jest閰嶇疆鏂囦欢
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/extension.js', // 鍏ュ彛鏂囦欢闇€瑕乿scode API锛屼笉閫傚悎鍗曞厓娴嬭瘯
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
  // 璁剧疆娴嬭瘯妯″潡瑙ｆ瀽鍒悕锛屼互閬垮厤鐩稿璺緞杩囬暱
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
    '^vscode$': '<rootDir>/test/mocks/vscode.js',
  },
  // 鍦ㄦ瘡涓祴璇曟枃浠朵箣鍓嶈缃叏灞€鍙橀噺鍜屾ā鎷?
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
};
