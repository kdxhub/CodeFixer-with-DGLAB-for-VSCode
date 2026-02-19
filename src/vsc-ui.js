const vscode = require('vscode');
const dglab = require('./dglab-server/main.js');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const conf = require('./config.js');
let qrcode/* ES模块需要异步加载 */;
async function loadQrcode() {
  if (!qrcode) {
    qrcode = await import('qrcode');
  }
  return qrcode;
}

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

// 变量
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
  console.log(`触发状态栏刷新动作，当前状态为：`, dglab.getStatus());
  switch (dglab.getStatus()) {
    case 0:
      elements.statusBar.info.text = "$(error)DGLAB：禁用";
      elements.statusBar.info.tooltip = "当前服务器未启用。\n点按以开启。";
      break;
    case 1:
      elements.statusBar.info.text = "$(stop-circle)DGLAB：暂停";
      elements.statusBar.info.tooltip = "当前服务已暂停，已连接${dglab.getConnected()}台客户端。\n点按以恢复。";
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

/**
 * 显示连接方法
 * @param {String} ip 传入IP,端口自动读取
 */
async function showConnect(ip = "0.0.0.0") {
  // 决定是否要覆写ip
  const confIp = conf.server.ip();
  let address = ip;
  if (confIp) { address = confIp };

  // 转为二维码并保存到临时文件
  const filePathPromise = generateQRCodeWithText(`https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://${address}:${conf.server.port()}`);
  const filePath = (await filePathPromise).normalize();
  if (filePath == null) { return; };

  // 显示二维码
  try {
    // 在编辑器中显示（列：vscode.ViewColumn.One 表示第一列）
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    if (confIp) {
      vscode.window.showInformationMessage(`二维码已生成并打开，请使用同一局域网下的 DG-LAB 客户端扫码连接。\n若无法查看二维码，你可手动访问 ${filePath} 。\nIP地址在配置文件中被覆写为 ${address} 。`);
    } else {
      vscode.window.showInformationMessage(`二维码已生成并打开，请使用同一局域网下的 DG-LAB 客户端扫码连接。\n若无法查看二维码，你可手动访问 ${filePath} 。\n识别到的IP地址为 ${address} ，若错误导致无法连接请在设置中手动覆写。`);
    };
  } catch (error) {
    vscode.window.showErrorMessage(`二维码已经生成，但无法打开: ${error.message}。\n你可手动访问 ${filePath} 。`);
  }
};

/**
 * 生成临时二维码
 * @param {String} text 
 * @returns 
 */
async function generateQRCodeWithText(text) {
  try {
    const qr = await loadQrcode();

    // 创建临时文件路径（在系统临时目录下）
    const tmpDir = os.tmpdir();
    const fileName = `DG-LAB-QRCODE-${Date.now()}.png`;
    const filePath = path.join(tmpDir, fileName);

    // 生成二维码并保存为 PNG
    await qr.toFile(filePath, text, {
      type: 'png',
      width: conf.server.qrcode.size(),
      margin: 2,
      color: {
        dark: '#000000',  // 黑色模块
        light: '#ffffff'  // 白色背景
      },
      errorCorrectionLevel: conf.server.qrcode.correctlevel()
    });
    console.log(`二维码已生成: ${filePath}`);
    return filePath;
  } catch (error) {
    vscode.window.showErrorMessage(`生成二维码失败: ${error.message}`);
    throw null;
  }
}

function onDisable() { }

module.exports = {
  elements: elements,
  updateStatusBar: updateStatusBar,
  onEnable: onEnable,
  onDisable: onDisable,
}
dglab.regisiter/* 注册回调函数 */(updateStatusBar, showConnect);