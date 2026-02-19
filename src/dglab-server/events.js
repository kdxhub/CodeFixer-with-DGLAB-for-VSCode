const vscode = require('vscode');
const config = require('../config.js');
const dglab = require('./main.js');

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

  // 上传
  console.log("上传纠错强度：", strength);
  switch (config.code.mode()) {
    case "left":
      dglab.power().right.set(0, 0);
      dglab.power().left.set(0, strength);
      break;
    case "right":
      dglab.power().right.set(0, strength);
      dglab.power().left.set(0, 0);
      break;
    case "bothAvg":
      dglab.power().right.set(0, strength / 2);
      dglab.power().left.set(0, strength / 2);
      break;
    case "bothAll":
      dglab.power().right.set(0, strength);
      dglab.power().left.set(0, strength);
      break;
    default:
      // 随机一边
      if (Math.random() <= .5) {
        dglab.power().right.set(0, strength);
        dglab.power().left.set(0, 0);
      } else {
        dglab.power().right.set(0, 0);
        dglab.power().left.set(0, strength);
      };
      break;
  }
  console.log("更新强度：", dglab.power().left.value, dglab.power().right.value);
}

function TerminalErrorcodeProcessor(event, context) {
  // 修正退出码
  let exitCode = event.exitCode;
  if (exitCode === undefined) {
    exitCode = config.terminal.interrupt();
  };
  let rate = config.terminal.rate();
  let duration = config.terminal.duration();
  if (exitCode <= 0 || rate <= 0 || duration <= 0) {
    return;
  };

  // 处理退出码
  let strength = exitCode * config.terminal.rate();

  // 上传
  console.log("上传纠错强度：", strength);
  const originLeft = dglab.power().left.value[1];
  const originRight = dglab.power().right.value[1];
  const invertable = config.terminal.inrevertable();
  switch (config.code.mode()) {
    case "left":
      dglab.power().right.set(1, 0);
      dglab.power().left.set(1, strength + originLeft);
      if (invertable) {
        setTimeout(() => {
          dglab.power().left.set(1, -strength + dglab.power().left.value[1]);
        }, duration);
      };
      break;
    case "right":
      dglab.power().right.set(1, strength + originRight);
      dglab.power().left.set(1, 0);
      if (invertable) {
        setTimeout(() => {
          dglab.power().right.set(1, -strength + dglab.power().right.value[1]);
        }, duration);
      };
      break;
    case "bothAvg":
      dglab.power().right.set(1, strength / 2 + originRight);
      dglab.power().left.set(1, strength / 2 + originLeft);
      if (invertable) {
        setTimeout(() => {
          dglab.power().right.set(1, -strength / 2 + dglab.power().right.value[1]);
          dglab.power().left.set(1, -strength / 2 + dglab.power().left.value[1]);
        }, duration);
      };
      break;
    case "bothAll":
      dglab.power().right.set(1, strength + originRight);
      dglab.power().left.set(1, strength + originLeft);
      if (invertable) {
        setTimeout(() => {
          dglab.power().right.set(1, -strength + dglab.power().right.value[1]);
          dglab.power().left.set(1, -strength + dglab.power().left.value[1]);
        }, duration);
      };
      break;
    default:
      // 随机一边
      if (Math.random() <= .5) {
        dglab.power().right.set(1, strength + originRight);
        dglab.power().left.set(1, 0);
        if (invertable) {
          setTimeout(() => {
            dglab.power().right.set(1, -strength + dglab.power().right.value[1]);
          }, duration);
        };
      } else {
        dglab.power().right.set(1, 0);
        dglab.power().left.set(1, strength + originLeft);
        if (invertable) {
          setTimeout(() => {
            dglab.power().left.set(1, -strength + dglab.power().left.value[1]);
          }, duration);
        };
      };
      break;
  }
  console.log("更新强度：", dglab.power().left.value, dglab.power().right.value);
}

module.exports = {
  EventDiagnosticProcessor,
  TerminalErrorcodeProcessor,
}