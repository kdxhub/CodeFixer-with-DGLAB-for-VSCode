const vscode = require('vscode');
const dglab = require('./dglab-server.js');

/**
 * 插件持有的全部VSC UI元素
 */
const elements = {
  commands: {
    open_config: vscode.commands.registerCommand('dglab.open_config', function () {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:kdxiaoyi.codefixer-with-dg-lab'
      );
    }),
    start: vscode.commands.registerCommand('dglab.server_start', function () {
      dglab.startServer();
    }),
    stop: vscode.commands.registerCommand('dglab.server.stop', function () {
      dglab.stopServer();
    }),
    pause: vscode.commands.registerCommand('dglab.server.pause', function () {
      dglab.power.pause();
    }),
    detail: vscode.commands.registerCommand('dglab.detail', function () {
      dglab.switchMode();
    }),
  },
  statusBar: {
    info: vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    ),
  },
}

var context;

/**
 * 注册VSCODE UI
 * @param {vscode.ExtensionContext} c
 */
function onEnable(c) {
  context = c;
  // 注册命令
  for (let key in elements.commands) {
    if (elements.commands.hasOwnProperty(key)) {
      context.subscriptions.push(elements.commands[key]);
    }
  }

  // 注册右下角的信息栏
  updateStatusBar(0, 0, 0);
  elements.statusBar.info.command = "dglab.detail";
  elements.statusBar.info.show();
  context.subscriptions.push(elements.statusBar.info);
}

/**
 * 更新状态栏提示
 * @param {Number} left 
 * @param {Number} right 
 * @param {Number} status 当前状态。0服务器关闭，1当前暂停，2当前工作，3未连接客户端，其它值故障
 */
function updateStatusBar(left, right, status) {
  switch (status) {
    case 0:
      elements.statusBar.info.text = "$(error)DGLAB：禁用";
      elements.statusBar.info.tooltip = "当前服务器未启用。\n点按以开启。";
      break;
    case 1:
      elements.statusBar.info.text = "$(stop-circle)DGLAB：暂停";
      elements.statusBar.info.tooltip = "当前服务已暂停。\n点按以恢复。";
      break;
    case 2:
      elements.statusBar.info.text = `$(heart)DGLAB ${left} | ${right}`;
      elements.statusBar.info.tooltip = "当前服务正在运行。\n两侧数字代表对应方向的强度。\n点按以暂停。";
      break;
    case 3:
      elements.statusBar.info.text = `$(warning)DGLAB：等待连接`;
      elements.statusBar.info.tooltip = "当前服务正在运行，但没有客户端连接。\n点按以连接。";
      break;
    default:
      elements.statusBar.info.text = "$(warning)DGLAB：异常";
      elements.statusBar.info.tooltip = "当前服务出现异常，需要进一步操作。\n点按以重试。";
      break;
  }
}

function onDisable() { }

module.exports = {
  onEnable,
  onDisable,
  updateStatusBar,
  elements: elements,
}
