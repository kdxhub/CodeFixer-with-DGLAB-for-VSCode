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
    // 第一个表示代码纠错，第二个表示终端纠错
    value: [0, 0],
    set: function (index, value) { power.left.value[index] = value; },
    get: function () { return power.left.value[0] + power.left.value[1]; },
  },
  right: {
    value: [0, 0],
    set: function (index, value) { power.right.value[index] = value; },
    get: function () { return power.right.value[0] + power.right.value[1]; },
  },
  paused: false,
  pause: function () {
    power.paused = !power.paused;
    if (power.paused == true) {
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

// 警告信息文本
const warnmsg = `欢迎使用本插件。在继续执行操作前，请认真阅读以下注意事项并充分了解风险：
1. 本插件通过联动 DG-LAB 物理设备，将VSCode中某些状态转换为该设备的强度，实施电击用户；
2. 因此用户在使用本插件的过程中可能会因为偶发现象接受到过量的电刺激；
3. 请您在 DG-LAB 客户端内设置最大电击强度，以免意外发生；
4. 本插件推荐连续使用时长不超过 30 分钟：因为随着用户身体对电击的适应，本插件带来的电击刺激可能会减弱，因此推荐不要使用过长时间以恢复对电击刺激的敏感度；
5. 如您在使用过程中感到不适或不能接受上述刺激，请及时停止本插件运行；
6. 请注意，使用本插件即代表您知悉并同意 VSCode著作权人、本插件作者等相关人或单位或企业 不对您使用本插件所产生的任何后果负责。
`;

function startServer() {
  vscode.window.showInformationMessage(
    warnmsg,
    { modal: true },
    '确定',
    '不同意',
    '取消',
    '已阅',
    '同意',
    '我已认真阅读并同意上述事项'
  ).then(selection => {
    if (selection === '我已认真阅读并同意上述事项') {
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
          if (!power.paused) { status = 2; };
          updateStatusBar();
          console.log('新客户端连接');
          ws.on('message', (data) => { //TODO: 与客户端沟通
          });
          ws.on('close', () => {
            connected -= 1;
            if (connected <= 0) {
              if (!power.paused) { status = 3; };
              connected = 0;
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
  });
}

function stopServer() {
  if (wsServer) {
    wsServer.close(() => {
      vscode.window.showInformationMessage("WebScoket服务器已关闭");
      updateStatusBar();
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
    updateStatusBar();
  }
  status = 0;
  power.paused = false;
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