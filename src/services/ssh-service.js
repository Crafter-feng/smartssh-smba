/**
 * SSH服务模块
 * 处理所有与SSH连接相关的功能
 */

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const terminalManager = require('./terminal-manager');
const pathConverter = require('./path-converter');
const { logger } = require('../utils/logger');
const commandExistsSync = require('command-exists').sync;
const configLoader = require('../../adapters/config-loader');

/**
 * 建立SSH连接
 * @param {Object} server - 服务器配置
 * @param {Function} callback - 回调函数
 * @returns {Promise<Object>} - 连接结果
 */
async function connect(server, callback) {
  return new Promise((resolve, reject) => {
    try {
      if (!server || !server.host || !server.username) {
        logger.error('连接参数无效');
        return reject(new Error('连接参数无效'));
      }

      const conn = new Client();
      
      // 连接成功处理
      conn.on('ready', () => {
        logger.info(`成功连接到 ${server.host}`);
        if (callback) {
          callback(null, conn);
        }
        resolve({ success: true, conn });
      });
      
      // 连接错误处理
      conn.on('error', (err) => {
        logger.error(`连接到 ${server.host} 时出错: ${err.message}`);
        if (callback) {
          callback(err);
        }
        reject(err);
      });
      
      // 连接关闭处理
      conn.on('close', () => {
        logger.info(`连接到 ${server.host} 已关闭`);
      });
      
      // 连接结束处理
      conn.on('end', () => {
        logger.info(`连接到 ${server.host} 已结束`);
      });
      
      // 配置连接选项
      const connectOptions = {
        host: server.host,
        port: server.port || 22,
        username: server.username,
      };
      
      // 根据认证方式设置认证选项
      if (server.privateKey) {
        // 使用私钥认证
        try {
          connectOptions.privateKey = fs.readFileSync(server.privateKey);
          if (server.passphrase) {
            connectOptions.passphrase = server.passphrase;
          }
        } catch (err) {
          logger.error(`读取私钥文件时出错: ${err.message}`);
          return reject(err);
        }
      } else if (server.password) {
        // 使用密码认证
        connectOptions.password = server.password;
      } else {
        logger.error('未提供认证信息（密码或私钥）');
        return reject(new Error('未提供认证信息（密码或私钥）'));
      }
      
      // 建立连接
      conn.connect(connectOptions);
    } catch (err) {
      logger.error(`连接过程中出错: ${err.message}`);
      if (callback) {
        callback(err);
      }
      reject(err);
    }
  });
}

/**
 * 执行远程命令
 * @param {Object} conn - SSH连接
 * @param {string} command - 命令
 * @returns {Promise<Object>} - 执行结果
 */
async function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    if (!conn) {
      return reject(new Error('无效的连接'));
    }
    
    if (!command) {
      return reject(new Error('无效的命令'));
    }
    
    conn.exec(command, (err, stream) => {
      if (err) {
        logger.error(`执行命令时出错: ${err.message}`);
        return reject(err);
      }
      
      let stdout = '';
      let stderr = '';
      
      stream.on('data', (data) => {
        stdout += data.toString();
      });
      
      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      stream.on('close', (code) => {
        logger.info(`命令执行完成，退出码: ${code}`);
        resolve({
          code,
          stdout,
          stderr,
        });
      });
    });
  });
}

/**
 * 打开SSH终端
 * @param {Object} server - 服务器配置
 * @returns {Promise<Object>} - 打开终端结果
 */
async function openTerminal(server) {
  try {
    if (!server) {
      throw new Error('未指定服务器');
    }
    
    const terminal = terminalManager.createSshTerminal(server);
    
    if (!terminal) {
      throw new Error('无法创建SSH终端');
    }
    
    terminal.show();
    
    return { success: true, terminal };
  } catch (error) {
    logger.error(`打开SSH终端时出错: ${error.message}`);
    throw error;
  }
}

/**
 * 获取远程文件列表
 * @param {Object} conn - SSH连接
 * @param {string} remotePath - 远程路径
 * @returns {Promise<Array>} - 文件列表
 */
async function listFiles(conn, remotePath) {
  return new Promise((resolve, reject) => {
    if (!conn) {
      return reject(new Error('无效的连接'));
    }
    
    if (!remotePath) {
      return reject(new Error('无效的路径'));
    }
    
    conn.sftp((err, sftp) => {
      if (err) {
        logger.error(`创建SFTP会话时出错: ${err.message}`);
        return reject(err);
      }
      
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          logger.error(`读取目录时出错: ${err.message}`);
          return reject(err);
        }
        
        // 处理文件列表
        const files = list.map((item) => {
          return {
            name: item.filename,
            fullPath: path.posix.join(remotePath, item.filename),
            isDirectory: item.attrs.isDirectory(),
            size: item.attrs.size,
            modifyTime: new Date(item.attrs.mtime * 1000),
            permissions: item.attrs.mode,
          };
        });
        
        resolve(files);
      });
    });
  });
}

/**
 * 上传本地文件到远程
 * @param {Object} server - 服务器配置
 * @param {string} localPath - 本地路径
 * @param {string} remotePath - 远程路径
 * @returns {Promise<boolean>} - 上传结果
 */
async function uploadFile(server, localPath, remotePath) {
  let conn;
  
  try {
    if (!server || !localPath || !remotePath) {
      throw new Error('参数无效');
    }
    
    // 连接到服务器
    const result = await connect(server);
    conn = result.conn;
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.error(`创建SFTP会话时出错: ${err.message}`);
          return reject(err);
        }
        
        // 确保远程目录存在
        const remoteDir = path.posix.dirname(remotePath);
        sftp.mkdir(remoteDir, { mode: '0755' }, (mkdirErr) => {
          // 忽略目录已存在错误
          if (mkdirErr && mkdirErr.code !== 4) {
            logger.error(`创建远程目录时出错: ${mkdirErr.message}`);
          }
          
          // 上传文件
          sftp.fastPut(localPath, remotePath, (putErr) => {
            if (putErr) {
              logger.error(`上传文件时出错: ${putErr.message}`);
              return reject(putErr);
            }
            
            logger.info(`文件上传成功: ${localPath} -> ${remotePath}`);
            resolve(true);
          });
        });
      });
    });
  } catch (error) {
    logger.error(`上传文件过程中出错: ${error.message}`);
    throw error;
  } finally {
    // 关闭连接
    if (conn) {
      conn.end();
    }
  }
}

/**
 * 从远程下载文件
 * @param {Object} server - 服务器配置
 * @param {string} remotePath - 远程路径
 * @param {string} localPath - 本地路径
 * @returns {Promise<boolean>} - 下载结果
 */
async function downloadFile(server, remotePath, localPath) {
  let conn;
  
  try {
    if (!server || !remotePath || !localPath) {
      throw new Error('参数无效');
    }
    
    // 连接到服务器
    const result = await connect(server);
    conn = result.conn;
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          logger.error(`创建SFTP会话时出错: ${err.message}`);
          return reject(err);
        }
        
        // 确保本地目录存在
        const localDir = path.dirname(localPath);
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
        }
        
        // 下载文件
        sftp.fastGet(remotePath, localPath, (getErr) => {
          if (getErr) {
            logger.error(`下载文件时出错: ${getErr.message}`);
            return reject(getErr);
          }
          
          logger.info(`文件下载成功: ${remotePath} -> ${localPath}`);
          resolve(true);
        });
      });
    });
  } catch (error) {
    logger.error(`下载文件过程中出错: ${error.message}`);
    throw error;
  } finally {
    // 关闭连接
    if (conn) {
      conn.end();
    }
  }
}

/**
 * 检查SSH可执行文件
 * @returns {boolean} - SSH命令是否存在
 */
function checkSSHExecutable() {
  if (!commandExistsSync('ssh')) {
    logger.error('未找到SSH命令，请确保已安装SSH客户端');
    vscode.window.showErrorMessage('未找到SSH命令，请确保已安装SSH客户端');
    return false;
  }
  return true;
}

/**
 * 获取服务器列表
 * @returns {Array} - 服务器列表
 */
function getServerList() {
  return configLoader.getServerList();
}

/**
 * 根据文件路径查找服务器
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器配置，如果未找到则返回null
 */
function findServerForPath(filePath) {
  return pathConverter.findServerForPath(filePath);
}

module.exports = {
  connect,
  execCommand,
  openTerminal,
  listFiles,
  uploadFile,
  downloadFile,
  checkSSHExecutable,
  getServerList,
  findServerForPath
}; 