const vscode = require('vscode');
const dglab = require('./main.js');

function EventDiagnosticProcessor(event, context) {
  // 获取当前激活的编辑器
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // 只处理当前文件（可选：也可以处理 e.uris 里的所有文件）
  const currentUri = editor.document.uri;

  // 获取当前文件的所有诊断信息
  const diagnostics = vscode.languages.getDiagnostics(currentUri);

  // 分类统计
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  diagnostics.forEach(diagnostic => {
    switch (diagnostic.severity) {
      case vscode.DiagnosticSeverity.Error:
        errors++;
        break;
      case vscode.DiagnosticSeverity.Warning:
        warnings++;
        break;
      case vscode.DiagnosticSeverity.Information:
        infos++;
        break;
      // Hint 也可以归入 Info 或单独统计
      case vscode.DiagnosticSeverity.Hint:
        infos++;
        break;
    }
  });

  console.log(`当前文件 - 错误: ${errors}, 警告: ${warnings}, 提示: ${infos}`);
}

function TerminalErrorcodeProcessor(event, context) {
  const { terminal, shellIntegration } = event;
  // 监听这个终端的命令执行结束事件
  if (shellIntegration) {
    // 注意：这个事件在命令执行结束时触发
    vscode.window.onDidEndTerminalShellExecution(async (execEvent) => {
      // 获取退出码
      const exitCode = execEvent.exitCode;
      // 根据退出码判断执行结果
      if (exitCode === 0) {
        vscode.window.showInformationMessage(`命令完成，退出码: ${exitCode}`);
      } else if (exitCode === undefined) {
        console.log(`命令被中断（可能按了 Ctrl+C）`);
      } else {
        vscode.window.showErrorMessage(`命令失败，退出码: ${exitCode}`);
      }
    }, null, context.subscriptions);
  }
}

module.exports = {
  EventDiagnosticProcessor,
  TerminalErrorcodeProcessor,
}