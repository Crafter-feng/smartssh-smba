/**
 * 配置数据模拟
 */

// 模拟服务器配置
const mockServers = [
  {
    name: '测试服务器1',
    host: 'test1.example.com',
    username: 'testuser1',
    password: '',
    port: 22,
    privateKey: '/path/to/key1.pem',
    agent: false,
    initCommands: ['cd /var/www', 'ls -la'],
    pathMappings: [
      {
        localPath: 'C:\\Projects\\test1',
        remotePath: '/var/www/test1',
      },
    ],
  },
  {
    name: '测试服务器2',
    host: 'test2.example.com',
    username: 'testuser2',
    port: 2222,
    privateKey: '/path/to/key2.pem',
    agent: true,
    initCommands: [],
    pathMappings: [
      {
        localPath: 'C:\\Projects\\test2',
        remotePath: '/home/testuser2/projects',
      },
    ],
  },
];

// 模拟命令配置
const mockCommands = [
  {
    name: '列出文件',
    command: 'ls -la',
    description: '列出当前目录所有文件',
    icon: 'file-directory',
  },
  {
    name: '查看进程',
    command: 'ps aux | grep node',
    description: '查看Node进程',
    icon: 'gear',
  },
];

// 模拟工作区命令配置
const mockWorkspaceCommands = [
  {
    id: 'workspace-dev-server',
    name: '启动开发服务器',
    command: 'npm run dev',
    description: '启动开发环境',
    icon: 'play',
  },
  {
    name: '构建项目',
    command: 'npm run build',
    description: '构建生产环境',
    icon: 'package',
  },
];

// 模拟完整配置
const mockConfiguration = {
  'smartssh-smba.config': {
    showHostsInPickLists: true,
    serverList: mockServers,
    customCommands: mockCommands,
    enableLocalCommands: true,
  },
};

// 模拟工作区配置
const mockWorkspaceConfiguration = {
  'smartssh-smba': {
    customCommands: mockWorkspaceCommands,
  },
};

module.exports = {
  mockServers,
  mockCommands,
  mockWorkspaceCommands,
  mockConfiguration,
  mockWorkspaceConfiguration,
};
