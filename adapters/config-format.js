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
    smbMappingList: element.smbMappingList || [], // 新的SMB映射列表配置
    // 兼容旧版配置，如果存在旧的配置则转换为新格式
    smbMapping: element.smbMapping // 保留旧配置以供兼容
  };

  // 如果存在旧的 smbMapping 配置但没有新的 smbMappingList，则转换为新格式
  if (element.smbMapping && (!element.smbMappingList || element.smbMappingList.length === 0)) {
    config.smbMappingList = [{
      localPath: element.smbMapping.localPath,
      remotePath: element.smbMapping.remotePath
    }];
  }

  return config;
};

module.exports = format;
