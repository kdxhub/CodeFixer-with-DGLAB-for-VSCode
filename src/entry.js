const vscode = require('vscode');
const ui = require('./vsc-ui.js');
const dglab = require('./dglab-server/main.js');
const events = require('./dglab-server/events.js');
const config = require('./config.js');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 监听配置改变
  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('codefixer-with-dg-lab')) {
      console.log('配置已更新');
      config.onChangedConfig();
    }
  });
  // 注册UI
  ui.onEnable(context);

  // 监听代码纠错状态变化
  vscode.languages.onDidChangeDiagnostics((e) => {
    events.EventDiagnosticProcessor(context);
  }, null, context.subscriptions);
  vscode.window.onDidChangeActiveTextEditor(() => {
    events.EventDiagnosticProcessor(context);
  }, null, context.subscriptions);

  // 监听终端输出代码
  ensureShellIntegration();
  vscode.window.onDidEndTerminalShellExecution((e) => { events.TerminalErrorcodeProcessor(e, context) }, null, context.subscriptions);
  // vscode.window.onDidChangeTerminalShellIntegration(async (e) => { events.TerminalErrorcodeProcessor(e, context); }, null, context.subscriptions);
}

function deactivate() {
  if (dglab.getStatus() != 0) { dglab.stopServer() };
}

async function ensureShellIntegration() {
  const config = vscode.workspace.getConfiguration('terminal.integrated');
  const enabled = config.get('shellIntegration.enabled');

  if (!enabled) {
    // 询问用户是否要启用
    const answer = await vscode.window.showInformationMessage(
      '需要启用终端 Shell 集成才能处理终端命令执行结果，是否现在开启？',
      '开启',
      '暂不'
    );

    if (answer === '开启') {
      await config.update('shellIntegration.enabled', true, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Shell 集成已启用，请重启终端');
    }
  }
}

module.exports = {
  activate,
  deactivate
}
