/**
 * 路径转换服务
 * 处理本地路径和远程路径之间的转换
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs').promises;
const configLoader = require('../adapters/config-loader');
const { logger, logPathConversion } = require('../utils/logger');

/**
 * 将远程路径转换为本地路径
 * @param {string} remotePath - 远程路径
 * @param {Object} server - 服务器配置
 * @returns {string|null} - 转换后的本地路径，如果无法转换则返回null
 */
function convertRemotePathToLocal(remotePath, server) {
  logger.functionStart('convertRemotePathToLocal', { remotePath, serverName: server?.name });

  try {
    if (!remotePath || !server) {
      logger.debug('无效的参数: 远程路径或服务器为空');
      logger.functionEnd('convertRemotePathToLocal', { result: null });
      return null;
    }

    // 获取路径映射
    const pathMappings = getPathMappings(server);
    if (!pathMappings || pathMappings.length === 0) {
      logger.debug(`服务器 ${server.name} 没有配置路径映射`);
      logger.functionEnd('convertRemotePathToLocal', { result: null });
      return null;
    }

    // 标准化路径
    const normalizedRemotePath = normalizePath(remotePath);
    logger.debug(`标准化后的远程路径: ${normalizedRemotePath}`);

    // 尝试每个路径映射
    for (const mapping of pathMappings) {
      const remotePathPrefix = normalizePath(mapping.remotePath);
      logger.debug(`检查映射: ${mapping.remotePath} -> ${mapping.localPath}, 标准化后远程前缀: ${remotePathPrefix}`);

      // 检查远程路径是否以映射的远程路径开头
      if (normalizedRemotePath.startsWith(remotePathPrefix)) {
        // 提取相对路径
        const relativePath = normalizedRemotePath.substring(remotePathPrefix.length);
        logger.debug(`提取的相对路径: ${relativePath}`);

        // 构建本地路径
        const localPathPrefix = normalizePath(mapping.localPath);
        let localPath = path.join(localPathPrefix, relativePath);

        // 确保使用正确的路径分隔符
        localPath = normalizePath(localPath);

        logPathConversion(remotePath, localPath, {
          mapping,
          normalizedRemotePath,
          localPathPrefix,
          relativePath,
        });
        logger.functionEnd('convertRemotePathToLocal', { result: localPath });
        return localPath;
      }
    }

    logger.debug('未找到匹配的路径映射');
    logger.functionEnd('convertRemotePathToLocal', { result: null });
    return null;
  } catch (error) {
    logger.error(`远程路径转换出错: ${error.message}`, error);
    logger.functionEnd('convertRemotePathToLocal', { error: error.message });
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
  logger.functionStart('convertLocalPathToRemote', { localPath, serverName: server?.name });

  try {
    if (!localPath || !server) {
      logger.debug('无效的参数: 本地路径或服务器为空');
      logger.functionEnd('convertLocalPathToRemote', { result: null });
      return null;
    }

    // 获取路径映射
    const pathMappings = getPathMappings(server);
    if (!pathMappings || pathMappings.length === 0) {
      logger.debug(`服务器 ${server.name} 没有配置路径映射`);
      logger.functionEnd('convertLocalPathToRemote', { result: null });
      return null;
    }

    // 标准化路径
    const normalizedLocalPath = normalizePath(localPath);

    logger.debug(`转换本地路径: ${localPath} (标准化后: ${normalizedLocalPath})`);

    // 尝试每个路径映射
    for (const mapping of pathMappings) {
      // 标准化本地路径前缀
      const localPathPrefix = normalizePath(mapping.localPath);

      logger.debug(`检查映射: ${mapping.localPath} (标准化后: ${localPathPrefix}) -> ${mapping.remotePath}`);
      logger.debug(`检查本地路径 ${normalizedLocalPath} 是否以 ${localPathPrefix} 开头`);

      // 检查本地路径是否以映射的本地路径开头
      if (normalizedLocalPath.startsWith(localPathPrefix)) {
        // 提取相对路径
        let relativePath = normalizedLocalPath.substring(localPathPrefix.length);
        logger.debug(`提取的原始相对路径: ${relativePath}`);

        // 移除开头的斜杠
        relativePath = relativePath.replace(/^\/+/, '');
        logger.debug(`处理后的相对路径: ${relativePath}`);

        // 标准化远程路径前缀并确保末尾有一个斜杠
        let remotePathPrefix = normalizePath(mapping.remotePath);
        if (remotePathPrefix.endsWith('/')) {
          remotePathPrefix = remotePathPrefix.slice(0, -1);
        }
        logger.debug(`远程路径前缀: ${remotePathPrefix}`);

        // 构建远程路径
        let remotePath = `${remotePathPrefix}/${relativePath}`;
        logger.debug(`初始构建的远程路径: ${remotePath}`);

        // 确保使用正确的路径分隔符（远程总是使用正斜杠）
        remotePath = remotePath.replace(/\\/g, '/');

        // 处理多个连续的斜杠
        remotePath = remotePath.replace(/\/+/g, '/');
        logger.debug(`处理斜杠后的远程路径: ${remotePath}`);

        // 如果是根目录，确保格式正确
        if (remotePath === '//' || remotePath === '/./') {
          remotePath = '/';
          logger.debug('检测到根目录路径，已修正');
        }

        logPathConversion(localPath, remotePath, {
          mapping,
          normalizedLocalPath,
          remotePathPrefix,
          relativePath,
        });
        logger.functionEnd('convertLocalPathToRemote', { result: remotePath });
        return remotePath;
      }
    }

    logger.debug('未找到匹配的路径映射');
    logger.functionEnd('convertLocalPathToRemote', { result: null });
    return null;
  } catch (error) {
    logger.error(`本地路径转换出错: ${error.message}`, error);
    logger.functionEnd('convertLocalPathToRemote', { error: error.message });
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
  logger.functionStart('normalizePath', { path: p });

  if (!p) {
    logger.debug('路径为空');
    logger.functionEnd('normalizePath', { result: '' });
    return '';
  }

  // 处理Windows盘符格式，如C:\等
  let normalized = p;

  // 处理Windows驱动器字母，确保大写并格式一致
  const driveLetterMatch = normalized.match(/^([a-zA-Z]):\\/i);
  if (driveLetterMatch) {
    const driveLetter = driveLetterMatch[1].toUpperCase();
    logger.debug(`检测到Windows驱动器: ${driveLetter}:`);
    // 保留驱动器字母，但统一格式
    normalized = driveLetter + ':/' + normalized.substring(3);
    logger.debug(`驱动器格式化后: ${normalized}`);
  }

  // 将所有反斜杠替换为正斜杠
  const beforeSlashReplace = normalized;
  normalized = normalized.replace(/\\/g, '/');
  if (beforeSlashReplace !== normalized) {
    logger.debug(`反斜杠替换: ${beforeSlashReplace} -> ${normalized}`);
  }

  // 处理多个连续的斜杠（保留开头的双斜杠用于网络路径）
  const beforeMultiSlashProcessing = normalized;
  if (normalized.startsWith('//')) {
    normalized = '//' + normalized.substring(2).replace(/\/+/g, '/');
    logger.debug(`网络路径处理: ${beforeMultiSlashProcessing} -> ${normalized}`);
  } else {
    normalized = normalized.replace(/\/+/g, '/');
    if (beforeMultiSlashProcessing !== normalized) {
      logger.debug(`多斜杠处理: ${beforeMultiSlashProcessing} -> ${normalized}`);
    }
  }

  // 确保路径以斜杠结尾
  const beforeEndingSlash = normalized;
  if (!normalized.endsWith('/')) {
    normalized += '/';
    logger.debug(`添加结尾斜杠: ${beforeEndingSlash} -> ${normalized}`);
  }

  logger.debug(`标准化路径: ${p} -> ${normalized}`);
  logger.functionEnd('normalizePath', { result: normalized });
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

/**
 * 查找服务器的路径映射情况，详细记录
 * @param {string} filePath - 文件路径
 * @returns {Object|null} - 匹配的服务器配置及映射详情
 */
function findServerForPathDetailed(filePath) {
  logger.functionStart('findServerForPathDetailed', { filePath });

  try {
    if (!filePath) {
      logger.debug('无效的文件路径参数');
      logger.functionEnd('findServerForPathDetailed', { result: null });
      return null;
    }

    // 获取服务器列表
    const servers = configLoader.getServerList();
    if (!servers || servers.length === 0) {
      logger.debug('无可用的服务器配置');
      logger.functionEnd('findServerForPathDetailed', { result: null });
      return null;
    }

    // 标准化文件路径
    const normalizedFilePath = normalizePath(filePath);
    logger.debug(`文件路径已标准化: ${normalizedFilePath}`);

    // 记录所有的检查结果
    const checkResults = [];

    // 遍历所有服务器查找匹配
    for (const server of servers) {
      // 获取路径映射
      const pathMappings = getPathMappings(server);
      logger.debug(`服务器 ${server.name} 有 ${pathMappings.length} 个路径映射`);

      // 如果服务器没有路径映射，跳过
      if (!pathMappings || pathMappings.length === 0) {
        checkResults.push({
          serverName: server.name,
          result: false,
          reason: '无路径映射配置',
        });
        continue;
      }

      // 检查每个路径映射
      let serverMatched = false;
      for (const mapping of pathMappings) {
        const localPathPrefix = normalizePath(mapping.localPath);
        logger.debug(`检查本地路径映射: ${mapping.localPath} (标准化后: ${localPathPrefix})`);

        // 如果文件路径以本地路径前缀开头，则找到匹配
        if (normalizedFilePath.startsWith(localPathPrefix)) {
          serverMatched = true;
          const matchResult = {
            serverName: server.name,
            result: true,
            mapping: mapping,
            normalizedFilePath: normalizedFilePath,
            localPathPrefix: localPathPrefix,
          };
          checkResults.push(matchResult);
          logger.debug(`找到匹配的服务器: ${server.name}`, matchResult);
          logger.functionEnd('findServerForPathDetailed', { result: matchResult });
          return {
            server: server,
            mapping: mapping,
            details: matchResult,
          };
        } else {
          checkResults.push({
            serverName: server.name,
            mapping: mapping,
            result: false,
            reason: '路径前缀不匹配',
            normalizedFilePath: normalizedFilePath,
            localPathPrefix: localPathPrefix,
          });
        }
      }
    }

    logger.debug('查找结果: 未找到匹配的服务器', { checkResults });
    logger.functionEnd('findServerForPathDetailed', { result: null, checkResults });
    return null;
  } catch (error) {
    logger.error(`为路径查找服务器详情出错: ${error.message}`, error);
    logger.functionEnd('findServerForPathDetailed', { error: error.message });
    return null;
  }
}

module.exports = {
  convertRemotePathToLocal,
  convertLocalPathToRemote,
  findServerForPath,
  getPathMappings,
  normalizePath,
  checkPathExists,
  findServerForPathDetailed,
};
