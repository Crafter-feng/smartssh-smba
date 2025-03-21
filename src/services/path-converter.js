/**
 * 路径转换服务
 * 处理本地路径和远程路径之间的转换
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const configLoader = require('../adapters/config-loader');
const { logger } = require('../utils/logger');

/**
 * 将远程路径转换为本地路径
 * @param {string} remotePath - 远程路径
 * @param {Object} server - 服务器配置
 * @returns {string|null} - 转换后的本地路径，如果无法转换则返回null
 */
function convertRemotePathToLocal(remotePath, server) {
  try {
    if (!remotePath || !server) {
      return null;
    }

    // 获取路径映射
    const pathMappings = getPathMappings(server);
    if (!pathMappings || pathMappings.length === 0) {
      return null;
    }

    // 标准化路径
    const normalizedRemotePath = normalizePath(remotePath);

    // 尝试每个路径映射
    for (const mapping of pathMappings) {
      const remotePathPrefix = normalizePath(mapping.remotePath);

      // 检查远程路径是否以映射的远程路径开头
      if (normalizedRemotePath.startsWith(remotePathPrefix)) {
        // 提取相对路径
        const relativePath = normalizedRemotePath.substring(remotePathPrefix.length);

        // 构建本地路径
        const localPathPrefix = normalizePath(mapping.localPath);
        let localPath = path.join(localPathPrefix, relativePath);

        // 确保使用正确的路径分隔符
        localPath = normalizePath(localPath);

        logger.debug(`路径转换: ${remotePath} -> ${localPath}`);
        return localPath;
      }
    }

    return null;
  } catch (error) {
    logger.error(`远程路径转换出错: ${error.message}`);
    return null;
  }
}

/**
 * 将本地路径转换为远程路径
 * @param {string} localPath - 本地路径
 * @param {Object} server - 服务器配置
 * @returns {string|null} - 转换后的远程路径，如果无法转换则返回null
 */
function convertLocalPathToRemote(localPath, server) {
  try {
    if (!localPath || !server) {
      return null;
    }

    // 获取路径映射
    const pathMappings = getPathMappings(server);
    if (!pathMappings || pathMappings.length === 0) {
      return null;
    }

    // 标准化路径
    const normalizedLocalPath = normalizePath(localPath);

    // 尝试每个路径映射
    for (const mapping of pathMappings) {
      const localPathPrefix = normalizePath(mapping.localPath);

      // 检查本地路径是否以映射的本地路径开头
      if (normalizedLocalPath.startsWith(localPathPrefix)) {
        // 提取相对路径
        const relativePath = normalizedLocalPath.substring(localPathPrefix.length);

        // 构建远程路径
        const remotePathPrefix = normalizePath(mapping.remotePath);
        let remotePath = remotePathPrefix + relativePath.replace(/\\/g, '/');

        // 确保使用正确的路径分隔符（远程总是使用正斜杠）
        remotePath = normalizePath(remotePath);

        logger.debug(`路径转换: ${localPath} -> ${remotePath}`);
        return remotePath;
      }
    }

    return null;
  } catch (error) {
    logger.error(`本地路径转换出错: ${error.message}`);
    return null;
  }
}

/**
 * 根据文件路径查找适配的服务器
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器配置，如果未找到则返回null
 */
function findServerForPath(filePath) {
  try {
    if (!filePath) {
      return null;
    }

    // 获取服务器列表
    const servers = configLoader.getServerList();
    if (!servers || servers.length === 0) {
      return null;
    }

    // 标准化文件路径
    const normalizedFilePath = normalizePath(filePath);

    // 遍历所有服务器查找匹配
    for (const server of servers) {
      // 获取路径映射
      const pathMappings = getPathMappings(server);

      // 如果服务器没有路径映射，跳过
      if (!pathMappings || pathMappings.length === 0) {
        continue;
      }

      // 检查每个路径映射
      for (const mapping of pathMappings) {
        const localPathPrefix = normalizePath(mapping.localPath);

        // 如果文件路径以本地路径前缀开头，则找到匹配
        if (normalizedFilePath.startsWith(localPathPrefix)) {
          return server;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error(`为路径查找服务器出错: ${error.message}`);
    return null;
  }
}

/**
 * 获取服务器的路径映射
 * @param {Object} server - 服务器配置
 * @returns {Array} - 路径映射数组
 */
function getPathMappings(server) {
  if (!server) {
    return [];
  }

  const pathMappings = [];

  // 处理新的pathMappings数组
  if (server.pathMappings && Array.isArray(server.pathMappings)) {
    pathMappings.push(...server.pathMappings);
  }

  // 处理旧的单个smbMapping（向后兼容）
  if (server.smbMapping && server.smbMapping.localPath && server.smbMapping.remotePath) {
    pathMappings.push(server.smbMapping);
    // 记录日志以便告知使用新的配置
    logger.debug(`服务器"${server.name}"使用了弃用的smbMapping配置，请迁移到pathMappings`);
  }

  return pathMappings;
}

/**
 * 标准化路径，确保使用一致的路径分隔符
 * @param {string} p - 输入路径
 * @returns {string} - 标准化的路径
 */
function normalizePath(p) {
  if (!p) return '';

  // 将所有反斜杠替换为正斜杠
  let normalized = p.replace(/\\/g, '/');

  // 确保路径以斜杠结尾
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }

  return normalized;
}

/**
 * 检查路径是否存在
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} - 路径是否存在
 */
async function checkPathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  convertRemotePathToLocal,
  convertLocalPathToRemote,
  findServerForPath,
  getPathMappings,
  normalizePath,
  checkPathExists,
}; 