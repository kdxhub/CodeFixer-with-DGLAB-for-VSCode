const vscode = require('vscode');

// ── 模块引用 ──
const { ConfigManager } = require('./config-manager');
const { PowerManager, PulseManager } = require('./pulse-service');
const { ConnectionManager } = require('./connection-manager');
const { WebSocketServer } = require('./websocket-server');
const { StatusBarManager } = require('./vscode-ui');
const { VscodeEventHandler } = require('./vscode-events');

/**
 * 插件服务端固定 ID（用于模拟控制端）
 */
const SERVER_ID = 'c87d4640-17f3-4e23-862c-4f6ef7c550dd';

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // ── 1. 创建所有管理器实例（依赖注入） ──
  const configManager = new ConfigManager();
  const powerManager = new PowerManager();
  const pulseManager = new PulseManager();
  const connectionManager = new ConnectionManager(SERVER_ID);

  const wsServer = new WebSocketServer(
    connectionManager,
    powerManager,
    pulseManager,
    configManager
  );

  const eventHandler = new VscodeEventHandler(powerManager, configManager);

  const uiManager = new StatusBarManager(wsServer, connectionManager, powerManager, configManager);

  // ── 2. 连接事件处理 → UI 更新 ──
  eventHandler.onUpdate(() => uiManager.update());

  // ── 3. 监听配置变更 ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codefixer-with-dg-lab')) {
        console.log('配置已更新');
        configManager.refresh();
      }
    })
  );

  // ── 4. 激活 UI（注册命令和状态栏，绑定服务端回调） ──
  uiManager.activate(context);

  // ── 5. 注册 VSCode 事件监听器 ──
  eventHandler.registerListeners(context);
}

function deactivate() {
  // 无需手动处理，entry 中不再持有全局引用需要清理
}

module.exports = {
  activate,
  deactivate,
};
