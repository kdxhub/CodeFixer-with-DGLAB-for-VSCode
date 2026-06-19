const vscode = require('vscode');
const os = require('os');
const path = require('path');

/**
 * VSCode UI 管理器
 * 负责状态栏、命令注册、二维码生成。
 * 依赖注入：WebSocketServer, ConnectionManager, PowerManager, ConfigManager
 */
class StatusBarManager {
  /**
   * @param {import('../websocket-server/index.js').WebSocketServer} wsServer
   * @param {import('../connection-manager/index.js').ConnectionManager} connectionManager
   * @param {import('../pulse-service/index.js').PowerManager} powerManager
   * @param {import('../config-manager/index.js').ConfigManager} configManager
   */
  constructor(wsServer, connectionManager, powerManager, configManager) {
    this._wsServer = wsServer;
    this._cm = connectionManager;
    this._pm = powerManager;
    this._config = configManager;

    /** @type {vscode.ExtensionContext|null} */
    this._context = null;

    /** 状态栏元素 */
    this._statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    /** qrcode 模块（懒加载） */
    this._qrcode = null;
  }

  /**
   * 初始化：注册命令和状态栏
   * @param {vscode.ExtensionContext} context
   */
  activate(context) {
    this._context = context;

    // 注册命令
    const commands = {
      'dglab.open_config': () => {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:kdxiaoyi.codefixer-with-dg-lab'
        );
      },
      'dglab.server.start': () => this._wsServer.startServer(),
      'dglab.server.stop': () => this._wsServer.stopServer(),
      'dglab.server.pause': () => this._wsServer.switchMode(),
      'dglab.server.pause.forced': () => this._wsServer.forcePause('快捷键操作'),
      'dglab.detail': () => this._wsServer.switchMode(),
      'dglab.update': () => this.update(),
    };

    for (const [cmd, handler] of Object.entries(commands)) {
      const disposable = vscode.commands.registerCommand(cmd, handler);
      context.subscriptions.push(disposable);
    }

    // 注册状态栏
    this._statusBar.command = 'dglab.detail';
    this._statusBar.show();
    context.subscriptions.push(this._statusBar);

    // 初始化显示
    this.update();

    // 绑定服务端的回调
    this._bindServerCallbacks();
  }

  /**
   * 将 WebSocketServer 的回调绑定到 VSCode UI
   */
  _bindServerCallbacks() {
    const ws = this._wsServer;

    ws.onStatusChange(() => this.update());

    ws.onShowConnect(() => this.showConnect());

    ws.onInfo((msg) => vscode.window.showInformationMessage(msg));

    ws.onWarn((msg) => vscode.window.showWarningMessage(msg));

    ws.onError((msg) => vscode.window.showErrorMessage(msg));

    ws.onConfirm(async (msg) => {
      const result = await vscode.window.showInformationMessage(
        msg,
        { modal: true },
        '我已认真阅读并同意上述事项'
      );
      return result === '我已认真阅读并同意上述事项';
    });
  }

  /**
   * 更新状态栏
   */
  update() {
    const status = this._wsServer.getStatus();
    const connected = this._wsServer.getStatus() >= 2
      ? this._getBoundCount()
      : 0;

    switch (status) {
      case 0:
        this._statusBar.text = '$(error)DGLAB：禁用';
        this._statusBar.tooltip = '当前服务器未启用。\n点按以开启。';
        this._statusBar.backgroundColor = undefined;
        break;
      case 1:
        this._statusBar.text = '$(stop-circle)DGLAB：暂停';
        this._statusBar.tooltip = `当前服务已暂停，已连接${connected}台客户端。\n点按以恢复。`;
        this._statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 2:
        this._statusBar.text = `$(heart)DGLAB：${this._pm.getLeft()} | ${this._pm.getRight()}`;
        this._statusBar.tooltip = `当前服务正在运行，已连接${connected}台客户端。\n两侧数字代表对应方向的强度。\n点按以暂停。`;
        this._statusBar.backgroundColor = undefined;
        break;
      case 3:
        this._statusBar.text = '$(debug-disconnect)DGLAB：等待连接';
        this._statusBar.tooltip = '当前服务正在运行，但没有客户端连接。\n点按以连接。';
        this._statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      default:
        this._statusBar.text = '$(warning)DGLAB：异常';
        this._statusBar.tooltip = '当前服务出现异常，需要进一步操作。\n点按以停止服务器。';
        this._statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }

    this._wsServer.distributePunishment();
  }

  /**
   * 获取绑定客户端数量
   */
  _getBoundCount() {
    return this._cm.boundCount;
  }

  /**
   * 显示连接二维码
   * @param {string} [ip]
   */
  async showConnect(ip) {
    const address = this._config.serverOverrideIp || ip || this._config.getLocalIp();

    if (!address) {
      vscode.window.showErrorMessage('无法获取本地IP地址，请在设置中手动覆写。');
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:kdxiaoyi.codefixer-with-dg-lab server.override_ip'
      );
      return;
    }

    // 生成二维码
    const filePath = await this._generateQR(
      `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://${address}:${this._config.serverPort}/${this._cm.serverId}`
    );
    if (!filePath) return;

    try {
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
      if (this._config.serverOverrideIp) {
        vscode.window.showInformationMessage(
          `二维码已生成并打开，请使用同一局域网下的 DG-LAB 客户端扫码连接。\nIP地址在配置文件中被覆写为 ${address}。`
        );
      } else {
        vscode.window.showInformationMessage(
          `二维码已生成并打开，请使用同一局域网下的 DG-LAB 客户端扫码连接。\n识别到的IP地址为 ${address}，若错误导致无法连接请在设置中手动覆写。`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `二维码已经生成，但无法打开: ${error.message}。\n你可手动访问 ${filePath}。`
      );
    }
  }

  /**
   * 生成二维码 PNG 到临时目录
   * @param {string} text
   * @returns {Promise<string|null>}
   */
  async _generateQR(text) {
    try {
      if (!this._qrcode) {
        this._qrcode = await import('qrcode');
      }
      const tmpDir = os.tmpdir();
      const fileName = `DG-LAB-QRCODE-${Date.now()}.png`;
      const filePath = path.join(tmpDir, fileName);

      await this._qrcode.toFile(filePath, text, {
        type: 'png',
        width: this._config.serverQrSize,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: this._config.serverQrCorrectionLevel,
      });
      console.log(`二维码已生成: ${filePath}`);
      return filePath;
    } catch (error) {
      vscode.window.showErrorMessage(`生成二维码失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 清理
   */
  deactivate() {
    this._statusBar.dispose();
  }
}

module.exports = { StatusBarManager };
