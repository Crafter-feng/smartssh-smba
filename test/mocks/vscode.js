/**
 * VSCode API模拟
 * 用于在测试环境中模拟VSCode API
 */

// 简单的mock函数实现
const mockFn = () => {
  const fn = (...args) => {
    fn.calls.push(args);
    return fn.returnValue;
  };
  fn.calls = [];
  fn.returnValue = undefined;
  fn.mockReturnValue = value => {
    fn.returnValue = value;
    return fn;
  };
  fn.mockImplementation = implementation => {
    const originalFn = fn;
    const newFn = (...args) => {
      originalFn.calls.push(args);
      return implementation(...args);
    };
    newFn.calls = originalFn.calls;
    newFn.returnValue = originalFn.returnValue;
    newFn.mockReturnValue = originalFn.mockReturnValue;
    newFn.mockImplementation = originalFn.mockImplementation;
    return newFn;
  };
  return fn;
};

class MockStatusBarItem {
  constructor() {
    this.text = '';
    this.tooltip = '';
    this.command = '';
    this.color = '';
    this.visible = false;
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }
}

class MockTreeView {
  constructor() {
    this.visible = true;
    this.selection = [];
    this.onDidChangeSelection = mockFn();
    this.onDidExpandElement = mockFn();
    this.onDidCollapseElement = mockFn();
  }

  reveal() {
    return Promise.resolve();
  }
}

class MockOutputChannel {
  constructor(name) {
    this.name = name;
    this.content = '';
  }

  append(value) {
    this.content += value;
  }

  appendLine(value) {
    this.content += value + '\n';
  }

  clear() {
    this.content = '';
  }

  show() {}

  hide() {}

  dispose() {}
}

class MockTerminal {
  constructor(options = {}) {
    this.name = options.name || 'Terminal';
    this.commands = [];
    this.closed = false;
    this.shellPath = options.shellPath || null;
    this.shellArgs = options.shellArgs || [];
    this.processId = Promise.resolve(123);
  }

  sendText(text, addNewLine = true) {
    this.commands.push({ text, addNewLine });
  }

  show() {}

  hide() {}

  dispose() {
    this.closed = true;
  }
}

class MockWorkspaceConfiguration {
  constructor(config = {}) {
    this._config = config;
  }

  get(section) {
    return section ? this._config[section] : this._config;
  }

  update(section, value, configurationTarget = true) {
    this._config[section] = value;
    return Promise.resolve();
  }

  has(section) {
    return Object.prototype.hasOwnProperty.call(this._config, section);
  }
}

class MockMemento {
  constructor(initialState = {}) {
    this._state = { ...initialState };
  }

  get(key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(this._state, key) ? this._state[key] : defaultValue;
  }

  update(key, value) {
    this._state[key] = value;
    return Promise.resolve();
  }
}

class MockExtensionContext {
  constructor() {
    this.subscriptions = [];
    this.workspaceState = new MockMemento();
    this.globalState = new MockMemento();
    this.extensionPath = '/mock/extension/path';
    this.storagePath = '/mock/storage/path';
    this.globalStoragePath = '/mock/global/storage/path';
    this.logPath = '/mock/log/path';
  }
}

// 创建模拟的vscode对象
const vscode = {
  window: {
    createStatusBarItem: mockFn().mockImplementation(() => new MockStatusBarItem()),
    createOutputChannel: mockFn().mockImplementation(name => new MockOutputChannel(name)),
    createTerminal: mockFn().mockImplementation(options => new MockTerminal(options)),
    createTreeView: mockFn().mockImplementation(() => new MockTreeView()),
    showInformationMessage: mockFn().mockImplementation(() => Promise.resolve()),
    showWarningMessage: mockFn().mockImplementation(() => Promise.resolve()),
    showErrorMessage: mockFn().mockImplementation(() => Promise.resolve()),
    showQuickPick: mockFn().mockImplementation(items => Promise.resolve(items[0])),
    showInputBox: mockFn().mockImplementation(() => Promise.resolve('')),
    showTextDocument: mockFn().mockImplementation(() => Promise.resolve()),
    terminals: [],
    activeTerminal: null,
    onDidChangeActiveTerminal: mockFn(),
    onDidCloseTerminal: mockFn(),
  },
  workspace: {
    getConfiguration: mockFn().mockImplementation(section => new MockWorkspaceConfiguration()),
    openTextDocument: mockFn().mockImplementation(() => Promise.resolve()),
    saveAll: mockFn().mockImplementation(() => Promise.resolve(true)),
    onDidChangeConfiguration: mockFn(),
    workspaceFolders: [],
  },
  commands: {
    registerCommand: mockFn().mockImplementation((command, callback) => {
      return { dispose: mockFn() };
    }),
    executeCommand: mockFn().mockImplementation(() => Promise.resolve()),
  },
  extensions: {
    getExtension: mockFn().mockImplementation(() => null),
  },
  languages: {
    createDiagnosticCollection: mockFn().mockImplementation(() => ({
      set: mockFn(),
      delete: mockFn(),
      clear: mockFn(),
      dispose: mockFn(),
    })),
  },
  Uri: {
    file: mockFn().mockImplementation(path => ({ path })),
    parse: mockFn().mockImplementation(uri => ({ path: uri })),
  },
  EventEmitter: class {
    constructor() {
      this.listeners = [];
    }

    event = listener => {
      this.listeners.push(listener);
      return { dispose: () => this._dispose(listener) };
    };

    fire(event) {
      this.listeners.forEach(listener => listener(event));
    }

    _dispose(listener) {
      this.listeners = this.listeners.filter(l => l !== listener);
    }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
      this.tooltip = '';
      this.description = '';
      this.command = null;
      this.iconPath = null;
      this.contextValue = '';
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  Disposable: {
    from: mockFn().mockImplementation((...disposables) => ({
      dispose: () => disposables.forEach(d => d.dispose()),
    })),
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class {
    constructor(startLine, startCharacter, endLine, endCharacter) {
      this.start = new vscode.Position(startLine, startCharacter);
      this.end = new vscode.Position(endLine, endCharacter);
    }
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  },
};

module.exports = vscode;
