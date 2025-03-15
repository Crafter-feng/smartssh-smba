const vscode = require('vscode');

module.exports = {
  codesettings: true,
  filename: 'smartssh-smba.config',
  formatter: function () {
    try {
      // 获取整合后的配置
      const config = vscode.workspace.getConfiguration('smartssh-smba');
      const integratedConfig = config.get('config') || {
        showHostsInPickLists: false,
        serverList: [],
        customCommands: []
      };

      // 从配置中获取服务器列表
      const serverList = integratedConfig.serverList || [];

      // 转换为所需格式
      const configs = serverList.map(server => {
        return {
          name: server.name,
          configuration: server
        };
      });

      return {
        result: true,
        configs: configs
      };
    } catch (error) {
      console.error('加载 SmartSSH-SMBA 配置时出错:', error);
      return {
        result: false,
        configs: []
      };
    }
  }
};
