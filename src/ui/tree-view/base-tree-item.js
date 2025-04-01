/**
 * 基础树项组件
 * 提供共享的树项功能
 */

const vscode = require('vscode');
const { getIconForItem } = require('../../utils/icon-utils');

/**
 * 基础树项类 - 包含共享的功能
 */
class BaseTreeItem extends vscode.TreeItem {
  /**
   * 设置命令相关属性
   * @param {Object} commandObj - 命令对象
   * @param {string} contextValue - 上下文值
   * @param {boolean} enableClickAction - 是否启用点击动作
   */
  setupCommandProperties(commandObj, contextValue, enableClickAction = false) {
    // 设置图标
    if (commandObj && commandObj.icon) {
      this.iconPath = new vscode.ThemeIcon(commandObj.icon);
    } else {
      this.iconPath = getIconForItem(commandObj ? commandObj.command : this.label);
    }

    // 设置工具提示
    if (commandObj) {
      this.tooltip = `执行命令: ${commandObj.command}`;
      if (commandObj.description) {
        this.tooltip += `\n${commandObj.description}`;
      }
    } else {
      this.tooltip = `执行命令: ${this.label}`;
    }

    this.command = null;
  }
}

module.exports = BaseTreeItem;
