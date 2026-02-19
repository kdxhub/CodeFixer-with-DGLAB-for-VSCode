const vscode = require('vscode');
const conf = require('../config.js');
const ui = require('../vsc-ui.js');
const WebScoket = require('ws');
var status = 0;
/**
 * @type {WebScoket.Server}
 */
var wsServer;

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
  pause: function () { this.paused = !this.paused; },
}

function switchMode() { }

function startServer() {
  let port = conf.server.port();
  try {
    power.paused = false;
    wsServer = new WebScoket.Server({ port });
  } catch (error) {
    console.error("无法启动DGLAB WebScoket服务器：", error);
    vscode.window.showErrorMessage(`无法启动WebScoket服务器：${error.message}`);
  }
}

function stopServer() {
  if (wsServer) {
    wsServer.close(() => {
      status = 0;
      ui.updateStatusBar();
      vscode.window.showInformationMessage("WebScoket服务器已关闭");
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
    ui.updateStatusBar();
  }
}

module.exports = {
  power: power,
  startServer,
  stopServer,
  switchMode,
  getStatus,
}