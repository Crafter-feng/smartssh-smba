const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { logger } = require('../utils/logger');

/**
 * 搜索并打开文件
 * @param {string} fileName 文件名
 * @param {number} line 行号
 * @param {number} column 列号
 */
async function searchAndOpenFile(fileName, line, column) {
  try {
    logger.info(`尝试通过搜索打开文件: ${fileName}`);

    // 先尝试在工作区中精确匹配
    const files = await vscode.workspace.findFiles(`**/${fileName}`, null, 5);

    if (files.length === 0) {
      // 如果没找到，打开搜索框
      logger.info(`未找到文件 ${fileName}，打开搜索框`);
      await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
    } else if (files.length === 1) {
      // 如果只找到一个，直接打开
      const document = await vscode.workspace.openTextDocument(files[0]);
      const editor = await vscode.window.showTextDocument(document);
      if (line !== undefined) {
        const position = new vscode.Position(line - 1, column || 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    } else {
      // 如果找到多个，让用户选择
      const items = files.map(file => ({
        label: path.basename(file.fsPath),
        description: vscode.workspace.asRelativePath(file.fsPath),
        file
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要打开的文件'
      });

      if (selected) {
        const document = await vscode.workspace.openTextDocument(selected.file);
        const editor = await vscode.window.showTextDocument(document);
        if (line !== undefined) {
          const position = new vscode.Position(line - 1, column || 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
      }
    }
  } catch (error) {
    logger.error(`搜索和打开文件时出错: ${error.message}`);
    // 作为最后的后备方案，直接打开搜索框
    await vscode.commands.executeCommand('workbench.action.quickOpen', fileName);
  }
}

/**
 * 检查路径是否存在
 * @param {string} pathToCheck 要检查的路径
 * @returns {Promise<Object>} 路径存在信息
 */
async function checkPathExists(pathToCheck) {
  try {
    const stat = await fs.promises.stat(pathToCheck);
    return {
      exists: true,
      isDirectory: stat.isDirectory()
    };
  } catch (error) {
    return {
      exists: false,
      isDirectory: false
    };
  }
}

/**
 * 打开一个本地文件路径
 * @param {string} path 文件路径
 */
async function openLocalFile(path) {
  if (path) {
    try {
      // 打开文件
      const uri = vscode.Uri.file(path);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      return true;
    } catch (error) {
      logger.error(`打开文件 ${path} 时出错:`, error);
      vscode.window.showErrorMessage(`无法打开文件 ${path}: ${error.message}`);
      return false;
    }
  }
  return false;
}

/**
 * 在编辑器中打开文件，支持定位到特定行列
 * @param {string} filePath 文件路径
 * @param {number} line 行号
 * @param {number} column 列号
 */
async function openFileInEditor(filePath, line, column) {
  try {
    const document = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(document);
    if (line !== undefined) {
      const position = new vscode.Position(line - 1, column || 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
    return true;
  } catch (error) {
    logger.warn(`无法在编辑器中打开文件: ${error.message}`);
    return false;
  }
}

/**
 * 使用系统默认程序打开文件
 * @param {string} filePath 文件路径
 */
async function openFileWithOS(filePath) {
  try {
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('revealFileInOS', uri);
    return true;
  } catch (error) {
    logger.error(`使用系统程序打开文件失败: ${error.message}`);
    return false;
  }
}

module.exports = {
  searchAndOpenFile,
  checkPathExists,
  openLocalFile,
  openFileInEditor,
  openFileWithOS,
}; 