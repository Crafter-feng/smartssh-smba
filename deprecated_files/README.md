# 弃用文件

本目录包含在重构过程中被新版本替代的文件。这些文件暂时保留用于参考，以确保重构后的功能与原始功能保持一致。

## 文件列表

1. `extension.js` - 原始扩展入口点，现已被 `src/extension.js` 替代。
   - 包含所有原始功能的实现，包括SSH连接、SMB路径映射和命令管理等。
   - 新版本将这些功能拆分到了各个专门的模块中。

2. `serverTreeProvider.js` - 原始树视图提供者，现已被拆分为以下文件替代：
   - `src/ui/tree-view/server-provider.js` - 服务器树视图提供者
   - `src/ui/tree-view/command-provider.js` - 命令树视图提供者
   - `src/ui/tree-view/base-tree-item.js` - 基础树项组件

## 重构说明

这些文件作为重构前的参考保留。当完成所有功能测试并确认新架构完全可用后，可以安全删除这些文件。

请不要在新代码中引用这些文件，它们仅用于参考目的。 