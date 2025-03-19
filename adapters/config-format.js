/* eslint-disable @stylistic/comma-dangle */
const vscode = require('vscode');

var format = function (element) {
  var show_hosts = vscode.workspace.getConfiguration('smartssh-smba').showHostsInPickLists;
  var config = {
    name: (show_hosts) ? element.username + '@' + element.host : element.name, // 用于服务器列表
    username: element.username, // 用于授权
    password: element.password, // 用于授权（可以为undefined）
    host: element.host, // 用于授权
    port: element.port, // 用于授权（可以为undefined）
    privateKey: element.privateKey, // 用于授权（可以为undefined）
    agent: element.agent, // 用于授权（可以为undefined）
    customCommands: element.customCommands, // 用于指定会话开始时执行的命令
    smbMappingList: [] // 初始化为空数组
  };

  // 合并 smbMapping 到 smbMappingList
  if (element.smbMapping && (element.smbMapping.localPath || element.smbMapping.remotePath)) {
    config.smbMappingList.push({
      localPath: element.smbMapping.localPath,
      remotePath: element.smbMapping.remotePath
    });
  }

  // 添加新的 smbMappingList
  if (element.smbMappingList && Array.isArray(element.smbMappingList)) {
    element.smbMappingList.forEach(mapping => {
      if (mapping && (mapping.localPath || mapping.remotePath)) {
        config.smbMappingList.push({
          localPath: mapping.localPath,
          remotePath: mapping.remotePath
        });
      }
    });
  }

  return config;
};

module.exports = format;
