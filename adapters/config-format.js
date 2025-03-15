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
    smbMapping: element.smbMapping, // SMB映射配置（本地和远程路径）
  };
  return config;
};

module.exports = format;
