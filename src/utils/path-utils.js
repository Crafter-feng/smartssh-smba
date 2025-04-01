/**
 * 路径处理工具模块
 * 
 * 本模块提供了处理本地路径和远程路径之间的转换功能，
 * 主要用于支持SmartSSH-SMBA扩展中的SMB路径映射和路径识别功能。
 * 
 * 主要功能：
 * 1. 路径转换：本地路径与远程路径之间的相互转换
 * 2. 路径识别：从文本中识别可能的文件路径
 * 3. 服务器匹配：根据路径查找对应的服务器配置
 * 4. 路径处理：标准化路径格式，处理不同操作系统的路径差异
 */
const path = require('path');
const vscode = require('vscode');
const fs = require('fs').promises;
const configLoader = require('../adapters/config-loader');
const { logger, logPathConversion } = require('./logger');

// =============================================================================
// 路径标准化和基础处理
// =============================================================================

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
 * 提取文件信息（文件名、行号、列号）
 * @param {string} filePath 文件路径
 * @returns {Object} 文件信息对象
 */
function extractFileInfo(filePath) {
  try {
    // 处理 null 或非字符串输入
    if (filePath === null || typeof filePath !== 'string') {
      return {
        fileName: String(filePath), // 将非字符串输入转换为字符串
        line: undefined,
        column: undefined,
      };
    }

    // 处理空字符串
    if (filePath.trim() === '') {
      return {
        fileName: '',
        line: undefined,
        column: undefined,
      };
    }

    // 移除开头的 ./ 或 ../
    const cleanPath = filePath.replace(/^(?:\.\.?\/)+/, '');

    // 匹配行号和列号 - 修改正则表达式以匹配任何字符作为行号和列号
    const match = cleanPath.match(/^(.+?)(?::([^:]+))?(?::([^:]+))?$/);
    if (match) {
      const fileName = match[1];
      const lineStr = match[2];
      const colStr = match[3];

      // 对于行号和列号，只有当它们是有效的数字时才解析
      const line = lineStr && /^\d+$/.test(lineStr) ? parseInt(lineStr, 10) : undefined;
      const column = colStr && /^\d+$/.test(colStr) ? parseInt(colStr, 10) : undefined;

      try {
        return {
          fileName: path.basename(fileName),
          line,
          column,
        };
      } catch (error) {
        logger.error(`提取文件名时出错: ${error.message}`);
        return {
          fileName,
          line,
          column,
        };
      }
    }

    // 如果没有匹配到行号和列号格式，返回基本信息
    try {
      return {
        fileName: path.basename(cleanPath),
        line: undefined,
        column: undefined,
      };
    } catch (error) {
      logger.error(`提取文件名时出错: ${error.message}`);
      return {
        fileName: cleanPath,
        line: undefined,
        column: undefined,
      };
    }
  } catch (error) {
    logger.error(`提取文件信息时出错: ${error.message}`);
    // 出错时返回原始路径
    return {
      fileName: filePath,
      line: undefined,
      column: undefined,
    };
  }
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

// =============================================================================
// 路径映射处理
// =============================================================================

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

// =============================================================================
// 服务器匹配
// =============================================================================

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

// =============================================================================
// 路径识别和提取
// =============================================================================

/**
 * 在文本中查找潜在的文件路径
 * @param {string} text 要搜索的文本
 * @returns {Array} 找到的潜在路径信息
 */
function findPotentialPaths(text) {
  const results = [];
  try {
    // URL 检测的正则表达式
    const urlPattern = /(?:\b(?:https?|ftp|file):\/\/|www\.)[^\s/$.?#].[^\s]*/gi;

    // 记录 URL 位置
    const urlMatches = new Set();
    let urlMatch;
    while ((urlMatch = urlPattern.exec(text)) !== null) {
      for (let i = urlMatch.index; i < urlMatch.index + urlMatch[0].length; i++) {
        urlMatches.add(i);
      }
    }

    // 定义不同类型的路径匹配模式
    const patterns = [
      // 1. 标准 Unix 路径（以 / 或 ~/ 开头）
      {
        pattern: /((?:\/|~\/)[^:\s()"']+)(?::(\d+))?(?::(\d+))?/g,
        type: 'unix',
      },
      // 2. CMake 错误格式
      {
        pattern: /(?:^|\s)([^:\s()"']+(?:\.(?:cpp|hpp|c|h|cc|cxx|hxx|cmake|txt))?)(?:\((\d+)(?:,(\d+))?\)):/g,
        type: 'cmake',
      },
      // 3. Make/GCC 错误格式（包括相对路径）
      {
        pattern: /(?:^|\s)((?:\.{1,2}\/)?[^:\s()"']+(?:\.(?:cpp|hpp|c|h|cc|cxx|hxx|mk|in))?)(?::(\d+)(?::(\d+))?):(?:\s+(?:error|warning|note):|$)/g,
        type: 'make',
      },
      // 4. 相对路径格式（以 ./ 或 ../ 开头）
      {
        pattern: /((?:\.{1,2}\/)[^:\s()"']+)(?::(\d+))?(?::(\d+))?/g,
        type: 'relative',
      },
    ];

    // 处理每种模式
    for (const { pattern, type } of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 检查是否与 URL 重叠
        let isPartOfUrl = false;
        for (let i = match.index; i < match.index + match[0].length; i++) {
          if (urlMatches.has(i)) {
            isPartOfUrl = true;
            break;
          }
        }

        if (isPartOfUrl) {
          logger.debug(`跳过 URL 的一部分: ${match[0]}`);
          continue;
        }

        const [fullMatch, path, lineStr, colStr] = match;

        // 提取文件名和行列号信息
        const fileName = path.split(/[/\\]/).pop();
        const line = lineStr ? parseInt(lineStr, 10) : undefined;
        const column = colStr ? parseInt(colStr, 10) : undefined;

        // 创建搜索信息对象
        const searchInfo = fileName
          ? {
            fileName,
            pattern: `**/${fileName}`,
            line,
            column,
          }
          : null;

        // 将所有找到的路径都添加到结果中，不做任何转换或处理
        // 转换和处理将在processPathsFromText函数中进行
        results.push({
          path: path, // 原始路径字符串
          startIndex: match.index,
          length: fullMatch.length,
          line,
          column,
          type,
          searchInfo,
          // 标记路径类型，方便后续处理
          isUnix: path.startsWith('/') || path.startsWith('~/'),
          isRelative: path.startsWith('./') || path.startsWith('../')
        });

        logger.debug(`找到路径 [${type}]: ${path}${line ? `:${line}` : ''}${column ? `:${column}` : ''}`);
      }
    }
  } catch (error) {
    logger.error(`查找路径时出错: ${error.message}`);
  }
  return results;
}

// =============================================================================
// 终端路径提取与处理
// =============================================================================

/**
 * 处理文本中的路径，提取并尝试转换为本地路径
 * @param {string} text 要处理的文本
 * @param {Object} server 服务器配置
 * @returns {Array} 处理后的路径信息数组，每项包含原始路径和转换后的本地路径
 */
function processPathsFromText(text, server) {
  logger.functionStart('processPathsFromText', { textLength: text?.length, serverName: server?.name });

  try {
    if (!text || !server) {
      logger.debug('无效参数: 文本或服务器为空');
      logger.functionEnd('processPathsFromText', { result: [] });
      return [];
    }

    // 第一步: 使用findPotentialPaths提取路径
    const pathResults = findPotentialPaths(text);
    logger.debug(`从文本中提取到 ${pathResults.length} 个潜在路径`);

    // 没有找到路径
    if (pathResults.length === 0) {
      logger.functionEnd('processPathsFromText', { result: [] });
      return [];
    }

    // 获取当前工作区路径(如果有)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    logger.debug(`当前工作区路径: ${workspaceRoot || '无'}`);

    // 第二步: 尝试将每个提取的路径转换为本地路径
    const processedResults = pathResults.map(result => {
      // 只有当路径存在时才处理
      if (!result.path) {
        logger.debug('跳过空路径');
        return result;
      }

      let localPath = null;
      const originalPath = result.path;

      // 根据路径类型进行不同的处理
      if (result.isUnix) {
        // 处理Unix绝对路径（以 / 或 ~/ 开头）- 需要转换为本地路径
        logger.debug(`处理Unix风格路径: ${originalPath}`);
        localPath = convertRemotePathToLocal(originalPath, server);
      } else if (result.isRelative) {
        // 处理相对路径（以 ./ 或 ../ 开头）
        logger.debug(`处理相对路径: ${originalPath}`);

        // 1. 首先尝试使用SSH终端当前工作目录(如果有)
        const currentRemoteDir = server.currentWorkingDirectory;
        if (currentRemoteDir) {
          // 构建完整的远程路径
          const fullRemotePath = path.posix.join(currentRemoteDir, originalPath);
          logger.debug(`构建完整远程路径: ${fullRemotePath}`);
          // 然后转换为本地路径
          localPath = convertRemotePathToLocal(fullRemotePath, server);
        }

        // 2. 如果1失败，且有本地工作区，尝试作为本地相对路径处理
        if (!localPath && workspaceRoot) {
          // 移除开头的 ./ 
          const cleanPath = originalPath.replace(/^\.\//, '');
          const possibleLocalPath = path.join(workspaceRoot, cleanPath);
          logger.debug(`尝试作为本地相对路径: ${possibleLocalPath}`);
          
          // 不执行异步检查，只返回转换后的路径
          localPath = possibleLocalPath;
        }
      } else {
        // 其他格式的路径
        logger.debug(`处理其他类型路径: ${originalPath}`);
        localPath = convertRemotePathToLocal(originalPath, server);
      }

      // 如果成功转换了路径
      if (localPath) {
        logger.debug(`路径 ${originalPath} 转换为本地路径: ${localPath}`);
        return {
          ...result,
          localPath,
          server
        };
      } else {
        logger.debug(`无法转换路径 ${originalPath} 为本地路径`);
      }

      // 如果无法转换，返回原始结果
      return result;
    });

    logger.functionEnd('processPathsFromText', {
      result: processedResults.length,
      convertedPaths: processedResults.filter(r => r.localPath).length
    });

    return processedResults;
  } catch (error) {
    logger.error(`处理文本路径时出错: ${error.message}`, error);
    logger.functionEnd('processPathsFromText', { error: error.message });
    return [];
  }
}

/**
 * 处理文本中的路径，提取、转换并尝试打开第一个有效路径
 * @param {string} text 要处理的文本
 * @param {Object} server 服务器配置
 * @returns {Promise<Object>} 处理结果，包含成功/失败信息和处理的路径
 */
async function openPathFromText(text, server) {
  logger.functionStart('openPathFromText', { textLength: text?.length, serverName: server?.name });

  try {
    // 处理输入参数
    if (!text || !server) {
      logger.debug('无效参数: 文本或服务器为空');
      logger.functionEnd('openPathFromText', { success: false, reason: '无效参数' });
      return { success: false, reason: '无效参数' };
    }

    // 获取处理后的路径
    const processedPaths = processPathsFromText(text, server);

    if (processedPaths.length === 0) {
      logger.debug('未找到有效路径');
      logger.functionEnd('openPathFromText', { success: false, reason: '未找到有效路径' });
      return { success: false, reason: '未找到有效路径' };
    }

    // 寻找第一个有本地路径的结果
    const validPath = processedPaths.find(p => p.localPath);

    if (!validPath) {
      logger.debug('找到路径，但无法转换为本地路径');
      logger.functionEnd('openPathFromText', { success: false, reason: '无法转换路径' });
      return {
        success: false,
        reason: '无法转换路径',
        paths: processedPaths
      };
    }

    // 导入文件服务
    const fileService = require('../services/file-service');

    // 检查路径是否存在以及类型
    const { exists, isDirectory } = await fileService.checkPathExists(validPath.localPath);

    // 路径处理逻辑...
    if (!exists) {
      // 处理不存在的路径
      const fileName = path.basename(validPath.path);
      await fileService.searchAndOpenFile(fileName, validPath.line, validPath.column);
      
      return {
        success: true,
        action: 'search',
        path: validPath
      };
    }

    if (isDirectory) {
      // 处理目录
      logger.debug(`处理目录: ${validPath.localPath}`);
      
      // 检查目录是否在工作区内
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      let isInWorkspace = false;
      
      if (workspaceRoot) {
        // 标准化路径比较
        const normalizedLocalPath = normalizePath(validPath.localPath);
        const normalizedWorkspacePath = normalizePath(workspaceRoot);
        isInWorkspace = normalizedLocalPath.startsWith(normalizedWorkspacePath);
        logger.debug(`目录是否在工作区内: ${isInWorkspace} (工作区: ${workspaceRoot})`);
      }
      
      if (isInWorkspace) {
        // 如果目录在工作区内，在资源管理器中显示该目录
        try {
          const uri = vscode.Uri.file(validPath.localPath);
          // 首先显示资源管理器视图
          await vscode.commands.executeCommand('workbench.view.explorer');
          // 然后在资源管理器中定位到文件夹
          await vscode.commands.executeCommand('revealInExplorer', uri);
          logger.debug(`在资源管理器中显示目录: ${validPath.localPath}`);
          
          return {
            success: true,
            action: 'revealInExplorer',
            path: validPath
          };
        } catch (error) {
          logger.error(`在资源管理器中显示目录时出错: ${error.message}`);
          // 失败时回退到使用系统默认程序打开
          await fileService.openFileWithOS(validPath.localPath);
          
          return {
            success: true,
            action: 'openDirectoryInOS',
            path: validPath
          };
        }
      } else {
        // 如果不在工作区，提示用户选择操作方式
        logger.debug(`目录不在工作区内，提示用户选择操作: ${validPath.localPath}`);
        
        const openOption = await vscode.window.showQuickPick(
          ['在当前窗口打开', '在新窗口打开', '添加到工作区', '在文件浏览器中打开'],
          { 
            placeHolder: '如何打开文件夹?', 
            ignoreFocusOut: true 
          }
        );
        
        if (!openOption) {
          // 用户取消操作
          logger.debug(`用户取消了对目录的操作: ${validPath.localPath}`);
          return {
            success: false,
            action: 'cancelled',
            path: validPath
          };
        }
        
        if (openOption === '在当前窗口打开') {
          // 在当前窗口打开
          logger.debug(`用户选择在当前窗口打开目录: ${validPath.localPath}`);
          try {
            const uri = vscode.Uri.file(validPath.localPath);
            await vscode.commands.executeCommand('vscode.openFolder', uri, false);
            return {
              success: true,
              action: 'openFolderInCurrentWindow',
              path: validPath
            };
          } catch (error) {
            logger.error(`在当前窗口打开目录时出错: ${error.message}`);
            vscode.window.showErrorMessage(`无法在当前窗口打开目录: ${error.message}`);
            return {
              success: false,
              error: error.message,
              action: 'openFolderInCurrentWindowFailed',
              path: validPath
            };
          }
        } else if (openOption === '在新窗口打开') {
          // 在新窗口打开
          logger.debug(`用户选择在新窗口打开目录: ${validPath.localPath}`);
          try {
            const uri = vscode.Uri.file(validPath.localPath);
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
            return {
              success: true,
              action: 'openFolderInNewWindow',
              path: validPath
            };
          } catch (error) {
            logger.error(`在新窗口打开目录时出错: ${error.message}`);
            vscode.window.showErrorMessage(`无法在新窗口打开目录: ${error.message}`);
            return {
              success: false,
              error: error.message,
              action: 'openFolderInNewWindowFailed',
              path: validPath
            };
          }
        } else if (openOption === '添加到工作区') {
          // 添加到工作区
          logger.debug(`用户选择添加目录到工作区: ${validPath.localPath}`);
          try {
            const uri = vscode.Uri.file(validPath.localPath);
            await vscode.workspace.updateWorkspaceFolders(
              vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
              null,
              { uri }
            );
            // 在资源管理器中显示添加的文件夹
            await vscode.commands.executeCommand('workbench.view.explorer');
            return {
              success: true,
              action: 'addToWorkspace',
              path: validPath
            };
          } catch (error) {
            logger.error(`添加目录到工作区时出错: ${error.message}`);
            vscode.window.showErrorMessage(`无法添加目录到工作区: ${error.message}`);
            return {
              success: false,
              error: error.message,
              action: 'addToWorkspaceFailed',
              path: validPath
            };
          }
        } else if (openOption === '在文件浏览器中打开') {
          // 在系统文件浏览器中打开
          logger.debug(`用户选择在文件浏览器中打开目录: ${validPath.localPath}`);
          await fileService.openFileWithOS(validPath.localPath);
          return {
            success: true,
            action: 'openDirectoryInOS',
            path: validPath
          };
        }
      }
    } else {
      // 处理文件
      const success = await fileService.openFileInEditor(validPath.localPath, validPath.line, validPath.column);
      
      if (!success) {
        await fileService.openFileWithOS(validPath.localPath);
      }
      
      return {
        success: true,
        action: 'openFile',
        editorSuccess: success,
        path: validPath
      };
    }
    
    // 如果所有条件都未满足，返回成功
    return {
      success: true,
      action: 'defaultAction',
      path: validPath
    };
  } catch (error) {
    logger.error(`打开路径时出错: ${error.message}`, error);
    logger.functionEnd('openPathFromText', { success: false, error: error.message });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// 模块导出
// =============================================================================

module.exports = {
  // 路径标准化和基础处理
  normalizePath,
  extractFileInfo,
  checkPathExists,

  // 路径映射处理
  getPathMappings,
  convertRemotePathToLocal,
  convertLocalPathToRemote,

  // 服务器匹配
  findServerForPath,
  findServerForPathDetailed,

  // 路径识别和提取
  findPotentialPaths,

  // 终端路径提取与处理
  processPathsFromText,
  openPathFromText
}; 
