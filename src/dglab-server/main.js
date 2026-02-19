const vscode = require('vscode');
const conf = require('../config.js');
const WebScoket = require('ws');

// 存储变量
/**
 * @see {@link getStatus()}
 */
var status = 0;
var connected = 0;
/**
 * @type {WebScoket.Server}
 */
var wsServer;

/* 注册回调函数并保证基本能用 */
let updateStatusBar = function () { return; } ;
function regisiter(updateStatusBarFunc) {
  updateStatusBar = updateStatusBarFunc;
};

/**
 * 获取当前状态
 * * 0 服务器关闭
 * * 1 暂停
 * * 2 工作
 * * 3 未连接客户端
 * * 其它值 故障
 * @returns {Number}
 */
function getStatus() { return status; };
/**
 * @returns {Number}
 */
function getConnected() { return connected; };

// 强度相关变量
const power = {
  left: {
    value: 0,
    set: function (value) { this.value = value; },
    get: function () { return this.value; },
  },
  right: {
    value: 0,
    set: function (value) { this.value = value; },
    get: function () { return this.value; },
  },
  paused: false,
  pause: function () {
    this.paused = !this.paused;
    if (this.paused) {
      status = 1;
      vscode.window.showInformationMessage("已暂停服务");
    } else {
      status = (connected <= 0) ? 3 : 2;
      vscode.window.showInformationMessage("服务恢复");
    }
    updateStatusBar();
  },
}

// --- 工具方法
function switchMode() {
  switch (getStatus()) {
    case 0:
      startServer();
      break;
    case 1:
      power.pause();
      break;
    case 2:
      power.pause();
      break;
    case 3:
      break;
    default:
      stopServer();
      break;
  }
}

function startServer() {
  let port = conf.server.port();
  try {
    power.paused = false;
    connected = 0;
    wsServer = new WebScoket.Server({ port });

    // 启动成功
    wsServer.on('listening', () => {
      status = 3;
      vscode.window.showInformationMessage(`WebSocket服务器已启动，端口: ${port}`);
      console.log(`成功启动WebScoket服务器 @ ws://localhost:${port}`);
      updateStatusBar();
    });

    // 注册连接事件
    wsServer.on('connection', (ws) => {
      connected += 1;
      status = 2;
      updateStatusBar();
      console.log('新客户端连接');
      ws.on('message', (data) => {
      });
      ws.on('close', () => {
        connected -= 1;
        if (connected <= 0) {
          status = 3;
          vscode.window.showInformationMessage("当前所有客户端已断开连接。");
        } else {
          vscode.window.showInformationMessage(`有客户端断开了连接，目前还有 ${connected} 台设备连接。`);
        };
        console.log('客户端连接断开');
        updateStatusBar();
      });
      ws.on('error', (error) => {
        vscode.window.showWarningMessage(`有客户端请求连接但无法连接：${error.message}`);
        console.error("有客户端请求连接但无法连接：", error);
        updateStatusBar();
      });
    });

    // 注册错误处理
    wsServer.on('error', (error) => {
      // @ts-ignore
      if (error.code === 'EADDRINUSE') {
        vscode.window.showErrorMessage(`端口 ${port} 已被占用，请更换端口。`);
      } else {
        vscode.window.showErrorMessage(`WebSocket服务器错误: ${error.message}。`);
      }
      status = -1;
      console.error('WebSocket 服务器错误:', error);
      updateStatusBar();
    });
  } catch (error) {
    status = -1;
    console.error("无法启动DGLAB WebScoket服务器：", error);
    vscode.window.showErrorMessage(`无法启动WebScoket服务器：${error.message}`);
    updateStatusBar();
  }
}

function stopServer() {
  if (wsServer) {
    wsServer.close(() => {
      status = 0;
      vscode.window.showInformationMessage("WebScoket服务器已关闭");
      updateStatusBar();
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
    updateStatusBar();
  }
}

module.exports = {
  power: () => { return power },
  startServer,
  stopServer,
  switchMode,
  getStatus,
  getConnected,
  wsServer: () => { return wsServer; },
  regisiter,
}