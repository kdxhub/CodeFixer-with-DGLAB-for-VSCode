import config from '../config.js';

const vscode = require('vscode');
const dglab = require('./main.js');

/**
 * 根据配置文件自动设置值
 * @param {number} index 
 * @param {string} mode 
 * @param {number} value 
 */
function setStrength(index, mode, value) {
  switch (mode) {
    case "left":
      dglab.power().left.set(index, value);
      break;
    case "right":
      dglab.power().right.set(index, value);
      break;
    case "bothAvg":
      dglab.power().right.set(index, value / 2);
      dglab.power().left.set(index, value / 2);
      break;
    case "bothAll":
      dglab.power().right.set(index, value);
      dglab.power().left.set(index, value);
      break;
    default:
      // 随机一边
      if (Math.random() <= .5) {
        dglab.power().right.set(index, value);
        dglab.power().left.set(index, 0);
      } else {
        dglab.power().right.set(index, 0);
        dglab.power().left.set(index, value);
      };
      break;
  }
  console.log("更新强度：", dglab.power().left.value, dglab.power().right.value);
}

function EventDiagnosticProcessor(event, context) {
  // 获取当前激活的编辑器
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // 分类统计
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  vscode.languages.getDiagnostics(/* 只处理当前文件（可选：也可以处理 e.uris 里的所有文件） */editor.document.uri).forEach(diagnostic => {
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

  // 数量转为强度
  let strength = 0;
  if (errors >= 1) {
    strength += config.code.error.first();
    strength += config.code.error.every() * (errors - 1);
  };
  if (warnings >= 1) {
    strength += config.code.warn.first();
    strength += config.code.warn.every() * (warnings - 1);
  };
  if (infos >= 1) {
    strength += config.code.info.first();
    strength += config.code.info.every() * (infos - 1);
  };
  console.log("上传纠错强度：", strength);
  setStrength(0, config.code.mode(), strength);
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