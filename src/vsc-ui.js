const vscode = require('vscode');
const dglab = require('./dglab-server/main.js');

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
    start: vscode.commands.registerCommand('dglab.server.start', dglab.startServer),
    stop: vscode.commands.registerCommand('dglab.server.stop', dglab.stopServer),
    pause: vscode.commands.registerCommand('dglab.server.pause', dglab.power().pause),
    detail: vscode.commands.registerCommand('dglab.detail', dglab.switchMode),
    update: vscode.commands.registerCommand('dglab.update', updateStatusBar),
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
  updateStatusBar();
  elements.statusBar.info.command = "dglab.detail";
  elements.statusBar.info.show();
  context.subscriptions.push(elements.statusBar.info);
}

/**
 * 更新状态栏提示
 */
function updateStatusBar() {
  switch (dglab.getStatus()) {
    case 0:
      elements.statusBar.info.text = "$(error)DGLAB：禁用";
      elements.statusBar.info.tooltip = "当前服务器未启用。\n点按以开启。";
      break;
    case 1:
      elements.statusBar.info.text = "$(stop-circle)DGLAB：暂停";
      elements.statusBar.info.tooltip = "当前服务已暂停。\n点按以恢复。";
      break;
    case 2:
      elements.statusBar.info.text = `$(heart)DGLAB ${dglab.power().left.get()} | ${dglab.power().right.get()}`;
      elements.statusBar.info.tooltip = `当前服务正在运行，已连接${dglab.getConnected()}台客户端。\n两侧数字代表对应方向的强度。\n点按以暂停。`;
      break;
    case 3:
      elements.statusBar.info.text = `$(warning)DGLAB：等待连接`;
      elements.statusBar.info.tooltip = "当前服务正在运行，但没有客户端连接。\n点按以连接。";
      break;
    default:
      elements.statusBar.info.text = "$(warning)DGLAB：异常";
      elements.statusBar.info.tooltip = "当前服务出现异常，需要进一步操作。\n点按以停止服务器。";
      break;
  }
}

function showHowToConnect(address) {}

function onDisable() { }

module.exports = {
  elements: elements,
  updateStatusBar: updateStatusBar,
  onEnable: onEnable,
  onDisable: onDisable,
  showHowToConnect: showHowToConnect,
}
