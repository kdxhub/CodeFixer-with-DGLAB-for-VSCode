const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const vscode = require('vscode');
const conf = require('../config.js');

// Shared variables
const clients = new Map();
const relations = new Map();
const clientTimers = new Map();
const punishmentDuration = 5;
const punishmentTime = 1;
let heartbeatInterval;

// Variables for main.js functionality
let status = 0;
let connected = 0;
let wsServer;
let updateStatusBar = function () { return; };

const power = {
  left: {
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
    if (power.paused) {
      status = 1;
      vscode.window.showInformationMessage("已暂停服务");
    } else {
      status = (connected <= 0) ? 3 : 2;
      vscode.window.showInformationMessage("服务恢复");
    }
    updateStatusBar();
  },
};

function regisiter(updateStatusBarFunc) {
  updateStatusBar = updateStatusBarFunc;
}

function getStatus() { return status; }
function getConnected() { return connected; }

function startServer() {
  vscode.window.showInformationMessage(
    `欢迎使用本插件。在继续操作前，请仔细阅读以下注意事项，充分了解相关风险：...`,
    { modal: true },
    '我已认真阅读并同意上述事项'
  ).then(selection => {
    if (selection === '我已认真阅读并同意上述事项') {
      let port = conf.server.port();
      try {
        power.paused = false;
        connected = 0;
        wsServer = new WebSocket.Server({ port });

        wsServer.on('listening', () => {
          status = 3;
          vscode.window.showInformationMessage(`WebSocket服务器已启动，端口: ${port}`);
          console.log(`成功启动WebSocket服务器 @ ws://localhost:${port}`);
          updateStatusBar();
        });

        wsServer.on('connection', (ws) => {
          handleConnection(ws);
        });

        wsServer.on('error', (error) => {
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
        console.error("无法启动DGLAB WebSocket服务器：", error);
        vscode.window.showErrorMessage(`无法启动WebSocket服务器：${error.message}`);
        updateStatusBar();
      }
    }
  });
}

function stopServer() {
  if (wsServer) {
    wsServer.close(() => {
      vscode.window.showInformationMessage("WebSocket服务器已关闭");
      updateStatusBar();
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
    updateStatusBar();
  }
  status = 0;
  power.paused = false;
}

function handleConnection(ws) {
  const clientId = uuidv4();
  console.log('新的 WebSocket 连接已建立，标识符为:', clientId);

  clients.set(clientId, ws);
  ws.send(JSON.stringify({ type: 'bind', clientId, message: 'targetId', targetId: '' }));

  ws.on('message', function incoming(message) {
    console.log("收到消息：" + message);
    let data = null;
    try {
      data = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'msg', clientId: "", targetId: "", message: '403' }));
      return;
    }

    if (clients.get(data.clientId) !== ws && clients.get(data.targetId) !== ws) {
      ws.send(JSON.stringify({ type: 'msg', clientId: "", targetId: "", message: '404' }));
      return;
    }

    if (data.type && data.clientId && data.message && data.targetId) {
      handleMessage(data, ws);
    }
  });

  ws.on('close', function close() {
    handleDisconnection(ws);
  });

  ws.on('error', function (error) {
    handleError(ws, error);
  });

  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      if (clients.size > 0) {
        console.log(relations.size, clients.size, '发送心跳消息：' + new Date().toLocaleString());
        clients.forEach((client, clientId) => {
          const heartbeatMsg = {
            type: "heartbeat",
            clientId: clientId,
            targetId: relations.get(clientId) || '',
            message: "200"
          };
          client.send(JSON.stringify(heartbeatMsg));
        });
      }
    }, 60 * 1000);
  }
}

function handleMessage(data, ws) {
  const { clientId, targetId, message, type } = data;
  switch (type) {
    case "bind":
      handleBind(clientId, targetId, ws);
      break;
    case 1:
    case 2:
    case 3:
      handleAppStrength(clientId, targetId, data);
      break;
    case 4:
      handleAppSpecificStrength(clientId, targetId, message);
      break;
    case "clientMsg":
      handleClientMsg(clientId, targetId, data, ws);
      break;
    default:
      handleDefaultMessage(clientId, targetId, type, message, ws);
      break;
  }
}

function handleBind(clientId, targetId, ws) {
  if (clients.has(clientId) && clients.has(targetId)) {
    if (![clientId, targetId].some(id => relations.has(id) || [...relations.values()].includes(id))) {
      relations.set(clientId, targetId);
      const client = clients.get(clientId);
      const sendData = { clientId, targetId, message: "200", type: "bind" };
      ws.send(JSON.stringify(sendData));
      client.send(JSON.stringify(sendData));
    } else {
      ws.send(JSON.stringify({ type: "bind", clientId, targetId, message: "400" }));
    }
  } else {
    ws.send(JSON.stringify({ clientId, targetId, message: "401", type: "bind" }));
  }
}

function handleAppStrength(clientId, targetId, data) {
  if (relations.get(clientId) !== targetId) {
    ws.send(JSON.stringify({ type: "bind", clientId, targetId, message: "402" }));
    return;
  }
  if (clients.has(targetId)) {
    const client = clients.get(targetId);
    const sendType = data.type - 1;
    const sendChannel = data.channel ? data.channel : 1;
    const sendStrength = data.type >= 3 ? data.strength : 1;
    const msg = "strength-" + sendChannel + "+" + sendType + "+" + sendStrength;
    const sendData = { type: "msg", clientId, targetId, message: msg };
    client.send(JSON.stringify(sendData));
  }
}

function handleAppSpecificStrength(clientId, targetId, message) {
  if (relations.get(clientId) !== targetId) {
    ws.send(JSON.stringify({ type: "bind", clientId, targetId, message: "402" }));
    return;
  }
  if (clients.has(targetId)) {
    const client = clients.get(targetId);
    const sendData = { type: "msg", clientId, targetId, message };
    client.send(JSON.stringify(sendData));
  }
}

function handleClientMsg(clientId, targetId, data, ws) {
  if (relations.get(clientId) !== targetId) {
    ws.send(JSON.stringify({ type: "bind", clientId, targetId, message: "402" }));
    return;
  }
  if (!data.channel) {
    ws.send(JSON.stringify({ type: "error", clientId, targetId, message: "406-channel is empty" }));
    return;
  }
  if (clients.has(targetId)) {
    let sendtime = data.time ? data.time : punishmentDuration;
    const target = clients.get(targetId);
    const sendData = { type: "msg", clientId, targetId, message: "pulse-" + data.message };
    let totalSends = punishmentTime * sendtime;
    const timeSpace = 1000 / punishmentTime;

    if (clientTimers.has(clientId + "-" + data.channel)) {
      console.log("通道" + data.channel + "覆盖消息发送中，总消息数：" + totalSends + "持续时间A：" + sendtime);
      ws.send("当前通道" + data.channel + "有正在发送的消息，覆盖之前的消息");

      const timerId = clientTimers.get(clientId + "-" + data.channel);
      clearInterval(timerId);
      clientTimers.delete(clientId + "-" + data.channel);

      switch (data.channel) {
        case "A":
          target.send(JSON.stringify({ clientId, targetId, message: "clear-1", type: "msg" }));
          break;
        case "B":
          target.send(JSON.stringify({ clientId, targetId, message: "clear-2", type: "msg" }));
          break;
        default:
          break;
      }

      setTimeout(() => {
        delaySendMsg(clientId, ws, target, sendData, totalSends, timeSpace, data.channel);
      }, 150);
    } else {
      delaySendMsg(clientId, ws, target, sendData, totalSends, timeSpace, data.channel);
      console.log("通道" + data.channel + "消息发送中，总消息数：" + totalSends + "持续时间：" + sendtime);
    }
  } else {
    console.log(`未找到匹配的客户端，clientId: ${clientId}`);
    ws.send(JSON.stringify({ clientId, targetId, message: "404", type: "msg" }));
  }
}

function handleDefaultMessage(clientId, targetId, type, message, ws) {
  if (relations.get(clientId) !== targetId) {
    ws.send(JSON.stringify({ type: "bind", clientId, targetId, message: "402" }));
    return;
  }
  if (clients.has(clientId)) {
    const client = clients.get(clientId);
    const sendData = { type, clientId, targetId, message };
    client.send(JSON.stringify(sendData));
  } else {
    ws.send(JSON.stringify({ clientId, targetId, message: "404", type: "msg" }));
  }
}

function handleDisconnection(ws) {
  console.log('WebSocket 连接已关闭');
  let clientId = '';
  clients.forEach((value, key) => {
    if (value === ws) {
      clientId = key;
    }
  });
  console.log("断开的client id:" + clientId);
  relations.forEach((value, key) => {
    if (key === clientId) {
      let appid = relations.get(key);
      let appClient = clients.get(appid);
      appClient.send(JSON.stringify({ type: "break", clientId, targetId: appid, message: "209" }));
      appClient.close();
      relations.delete(key);
      console.log("对方掉线，关闭" + appid);
    } else if (value === clientId) {
      let webClient = clients.get(key);
      webClient.send(JSON.stringify({ type: "break", clientId: key, targetId: clientId, message: "209" }));
      webClient.close();
      relations.delete(key);
      console.log("对方掉线，关闭" + clientId);
    }
  });
  clients.delete(clientId);
  console.log("已清除" + clientId + " ,当前size: " + clients.size);
}

function handleError(ws, error) {
  console.error('WebSocket 异常:', error.message);
  let clientId = '';
  for (const [key, value] of clients.entries()) {
    if (value === ws) {
      clientId = key;
      break;
    }
  }
  if (!clientId) {
    console.error('无法找到对应的 clientId');
    return;
  }
  const errorMessage = 'WebSocket 异常: ' + error.message;
  relations.forEach((value, key) => {
    if (key === clientId) {
      let appid = relations.get(key);
      let appClient = clients.get(appid);
      appClient.send(JSON.stringify({ type: "error", clientId: clientId, targetId: appid, message: "500" }));
    }
    if (value === clientId) {
      let webClient = clients.get(key);
      webClient.send(JSON.stringify({ type: "error", clientId: key, targetId: clientId, message: errorMessage }));
    }
  });
}

function delaySendMsg(clientId, client, target, sendData, totalSends, timeSpace, channel) {
  target.send(JSON.stringify(sendData));
  totalSends--;
  if (totalSends > 0) {
    return new Promise((resolve, reject) => {
      const timerId = setInterval(() => {
        if (totalSends > 0) {
          target.send(JSON.stringify(sendData));
          totalSends--;
        }
        if (totalSends <= 0) {
          clearInterval(timerId);
          client.send("发送完毕");
          clientTimers.delete(clientId);
          resolve();
        }
      }, timeSpace);

      clientTimers.set(clientId + "-" + channel, timerId);
    });
  }
}

module.exports = {
  startServer,
  stopServer,
  switchMode,
  getStatus,
  getConnected,
  regisiter,
};