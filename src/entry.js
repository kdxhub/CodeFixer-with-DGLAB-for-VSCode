const vscode = require('vscode');
const ui = require('./vsc-ui.js');
const events = require('./dglab-server/events.js');
const conf = require('./config.js');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 注册UI
  ui.onEnable(context);

  // 监听代码纠错状态变化
  vscode.languages.onDidChangeDiagnostics((e) => { events.EventDiagnosticProcessor(e, context); }, null, context.subscriptions);

  // 监听终端输出代码
  vscode.window.onDidChangeTerminalShellIntegration(async (e) => { events.TerminalErrorcodeProcessor(e, context); }, null, context.subscriptions);
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
}
