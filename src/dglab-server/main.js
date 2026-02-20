const vscode = require('vscode');
const WebSocket = require('ws');
const conf = require('../config.js');
const { v4: uuidv4 } = require('uuid');

// 存储变量
/**
 * @see {@link getStatus()}
 */
var status = 0; // 0: 服务器关闭, 1: 暂停, 2: 工作中(有已绑定的APP), 3: 无APP连接
/**
 * @type {WebSocket.Server}
 */
var wss;
/** 储存所有已连接的客户端（包括已绑定和未绑定的） */
const allClients = new Map(); // key: clientId, value: WebSocket
/** 储存已绑定的客户端（即已经完成 bind 的 APP） */
const boundClients = new Map(); // key: clientId (APP), value: WebSocket
/** 存储客户端和发送计时器关系（保留原功能，未使用） */
const clientTimers = new Map();
/** 心跳消息模板 */
const heartbeatMsg = {
  type: "heartbeat",
  clientId: "",
  targetId: "",
  message: "200"
};
/** 
 * 心跳定时器
 * @type {NodeJS.Timeout}
 */
let heartbeatInterval = null;
/**
 * 插件自身的固定 ID，用于模拟前端（控制端）
 */
const targetId = "c87d4640-17f3-4e23-862c-4f6ef7c550dd";
/** 警告信息文本 */
const warnmsg = `欢迎使用本插件。在继续操作前，请仔细阅读以下注意事项，充分了解相关风险：
1. 功能说明：本插件通过联动 DG-LAB 设备，将 VSCode 中的特定状态转换为电击强度，从而对您施加电刺激。
2. 潜在风险：使用过程中可能因 VSCode 中状态数据过大等，导致您接收到超出预期的过量电刺激。
3. 安全设置：请务必在 DG-LAB 客户端中预先设置最大电击强度，以降低意外风险。但请注意，该设置并不能完全杜绝所有意外情况。
4. 用法警告：正如 DG-LAB 产品所声明的那样，请保证使用者知情同意、安全且清醒，位于非潮湿环境中，同时没有任何不适疾病；严禁将电极片置于皮肤破损处、肚脐眼上方等位置，以免电流导致生命危险；严禁在本插件未暂停时移动电极片和操作器械等。
5. 使用建议：为保障您的健康，建议单次在同一部位的连续使用不超过 30 分钟，并适时休息，避免皮肤或身体因长时间刺激而产生不适。
6. 停止条件：若您在过程中感到任何不适或无法接受当前刺激，请立即停止插件运行。
7. 免责声明：一旦使用本插件，即表示您已知悉并自愿承担上述所有风险。VSCode著作权人、本插件作者及相关贡献者均不对因使用本插件而产生的任何后果承担任何法律责任。
请确认您已认真阅读并理解以上内容。
 
同时，请知悉：按下 APP端任意按键 或 Ctrl+Alt+空格 （MacOS请换成Cmd+Alt+空格，可修改）可以强制暂停。
`;

/* 注册回调函数并保证基本能用 */
let updateStatusBar = function () { return; };
let showConnect = function (param1) { return; };
function regisiter(updateStatusBarFunc, showConnectFunc) {
  updateStatusBar = updateStatusBarFunc;
  showConnect = showConnectFunc;
};

/**
 * 获取当前状态
 * * 0 服务器关闭
 * * 1 暂停
 * * 2 工作（至少有一个已绑定的APP）
 * * 3 服务器运行但无已绑定的APP
 * * 其它值 故障
 * @returns {Number}
 */
function getStatus() { return status; };

/**
 * 获取已绑定的客户端数量
 * @returns {Number}
 */
function getConnected() { return boundClients.size; };

// 强度相关变量（保持不变）
const power = {
  left: {
    // 第一个表示代码纠错，第二个表示终端纠错
    value: [0, 0],
    set: function (index, value) { power.left.value[index] = value; },
    get: function () {
      if (power.paused) { return 0; };
      let v = Math.floor(power.left.value[0] + power.left.value[1]);
      if (v >= 200) {
        return 200;
      } else if (v <= 0) {
        return 0;
      } else { return v; };
    },
  },
  right: {
    value: [0, 0],
    set: function (index, value) { power.right.value[index] = value; },
    get: function () {
      if (power.paused) { return 0; };
      let v = Math.floor(power.right.value[0] + power.right.value[1]);
      if (v >= 200) {
        return 200;
      } else if (v <= 0) {
        return 0;
      } else { return v; };
    },
  },
  paused: false,
  pause: function () {
    power.paused = !power.paused;
    if (power.paused == true) {
      status = 1;
      vscode.window.showInformationMessage("已暂停服务");
    } else {
      status = (boundClients.size <= 0) ? 3 : 2;
      vscode.window.showInformationMessage("服务恢复");
    }
    updateStatusBar();
  },
  pauseForced: function (reason) {
    if (power.paused || status == 0) { return; };
    power.paused = true;
    updateStatusBar();
    vscode.window.showInformationMessage("已自动暂停。" + reason);
    return;
  },
};

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
      showConnect();
      break;
    default:
      stopServer();
      break;
  }
}

var startServerLock = false;
function startServer() {
  console.info("触发服务器开启流程");
  if (startServerLock) {
    console.warn("异步会话锁中断了服务器开启流程");
    return;
  };
  startServerLock = true;
  vscode.window.showInformationMessage(
    warnmsg,
    { modal: true },
    '确定',
    '不同意',
    '取消',
    '已阅',
    '同意',
    '我已认真阅读并同意上述事项'
  ).then((selection) => {
    if (selection === '我已认真阅读并同意上述事项') {
      startServerInternal();
    } else {
      startServerLock = false;
      console.warn("用户中断了服务器开启流程");
    }
  });
};

/** 
 * 立即下发强度配置和波形数据给所有已绑定的 APP
 * @apinote 更新强度后手动调用 vsc_ui.js 的 updateStatusBar()，其会自动调用本方法。
 * @apinote 每隔60秒心跳包下发时也会自动调用本方法。
 */
function distributePunishment() {
  if (boundClients.size <= 0) { return; };
  console.log("正在下发强度配置");

  // 遍历每个已绑定的客户端，发送配置包
  boundClients.forEach((client, appId) => {
    // 强度指令
    client.send(JSON.stringify({
      "type": "msg",
      "clientId": targetId,        // 发送方为插件自身
      "targetId": appId,           // 接收方为 APP 的 ID
      "message": `strength-1+2+${power.left.get()}`,
    }));
    client.send(JSON.stringify({
      "type": "msg",
      "clientId": targetId,
      "targetId": appId,
      "message": `strength-2+2+${power.right.get()}`,
    }));
    // 波形
    client.send(JSON.stringify({
      "type": "msg",
      "clientId": targetId,
      "targetId": appId,
      "message": "pulse-A:" + conf.pulse.left.getData(),
    }));
    client.send(JSON.stringify({
      "type": "msg",
      "clientId": targetId,
      "targetId": appId,
      "message": "pulse-B:" + conf.pulse.right.getData(),
    }));
  });
};

function startServerInternal() {
  let port = conf.server.port();
  try {
    power.paused = false;
    wss = new WebSocket.Server({ port });

    // 启动成功
    wss.on('listening', () => {
      status = 3; // 服务器运行但无绑定
      vscode.window.showInformationMessage(`WebSocket服务器已启动，端口: ${port}`);
      console.log(`成功启动WebSocket服务器 @ ws://localhost:${port}`);
      updateStatusBar();
    });

    // 启动心跳定时器
    if (!heartbeatInterval) {
      heartbeatInterval = setInterval(() => {
        // 向所有已连接的客户端发送心跳消息（包括未绑定的）
        if (allClients.size > 0) {
          console.log("向 ", allClients.size, ' 个客户端发送心跳消息：' + new Date().toLocaleString());
          allClients.forEach((client, clientId) => {
            let msg = {
              ...heartbeatMsg,
              clientId: clientId,
              targetId: targetId
            };
            client.send(JSON.stringify(msg));
          });
          // 心跳时顺便下发强度和波形（保持原有行为）
          distributePunishment();
        };
      }, 60 * 1000);
    };

    // 注册连接事件
    wss.on('connection', (ws) => {
      // 为新连接分配唯一 ID
      const clientId = uuidv4();
      console.log('新的 WebSocket 连接已建立，标识符为:', clientId);
      allClients.set(clientId, ws);

      // 发送 bind 消息，告知其自己的 ID
      ws.send(JSON.stringify({
        type: 'bind',
        clientId: clientId,
        targetId: '',
        message: 'targetId'
      }));

      // 确立后续协议
      ws.on('message', (ev) => {
        const id = `#${Math.floor(Math.random() * 1e6)}`;
        console.log(`收到消息${id} ：` + ev);
        let data = null;
        try {
          data = JSON.parse(ev.toString());
        } catch (e) {
          console.warn(`消息${id} 无效：`, e);
          ws.send(JSON.stringify({
            type: 'msg',
            clientId: "",
            targetId: "",
            message: '403'  // 非标准 JSON
          }));
          return;
        };

        // 处理绑定请求（APP 请求与控制端绑定）
        if (data.type === "bind") {
          console.log("正在处理绑定请求");
          if (data.message === "DGLAB") {
            // APP 请求绑定到固定 targetId
            // 将当前连接标记为已绑定
            boundClients.set(data.clientId, ws);
            // 回复绑定成功
            ws.send(JSON.stringify({
              type: 'bind',
              clientId: data.clientId,
              targetId: targetId,
              message: '200'
            }));
            // 更新状态
            if (!power.paused) {
              status = 2;
            }
            updateStatusBar();
            console.log(`绑定成功：APP ${data.clientId} 已绑定到控制端 ${targetId}`);
          } else {
            // 可能是初次连接后的 ID 确认，忽略
            // 但也可以回复错误
          }
          return;
        };

        // 检查消息来源是否合法（必须与存储的连接匹配）
        if (allClients.get(data.clientId) !== ws) {
          console.warn(`消息${id} 无效，来源不正确。`);
          ws.send(JSON.stringify({
            type: 'msg',
            clientId: "",
            targetId: "",
            message: '404'
          }));
          return;
        };

        // 处理 APP 反馈消息（任何按钮按下视为暂停）
        if (data.type === "msg" && data.message.startsWith("feedback-") && !power.paused) {
          power.pauseForced("APP按钮被点击。");
        }

        // 其他消息可以按需处理，此处暂时忽略
      });

      ws.on('close', () => {
        console.log('WebSocket 连接已关闭');
        // 从所有存储中移除
        let closedClientId = null;
        for (let [id, client] of allClients.entries()) {
          if (client === ws) {
            closedClientId = id;
            allClients.delete(id);
            break;
          }
        }
        if (closedClientId) {
          boundClients.delete(closedClientId);
          console.log("已清除client " + closedClientId + "，当前剩余连接数: " + allClients.size + "，已绑定数: " + boundClients.size);
        }

        // 更新状态
        if (boundClients.size <= 0) {
          if (!power.paused) { status = 3; }
          vscode.window.showInformationMessage("当前没有已绑定的APP。");
        } else {
          vscode.window.showInformationMessage(`有客户端断开连接，目前还有 ${boundClients.size} 台设备已绑定。`);
        }
        updateStatusBar();
      });

      ws.on('error', (error) => {
        console.error("WebSocket 连接错误：", error);
        // 尝试清理
        let errClientId = null;
        for (let [id, client] of allClients.entries()) {
          if (client === ws) {
            errClientId = id;
            allClients.delete(id);
            boundClients.delete(id);
            break;
          }
        }
        vscode.window.showWarningMessage(`客户端连接错误：${error.message}`);
        updateStatusBar();
      });
    });

    // 注册服务器错误处理
    wss.on('error', (error) => {
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
    console.error("无法启动DGLAB WebSocket服务器：", error);
    vscode.window.showErrorMessage(`无法启动WebSocket服务器：${error.message}`);
    updateStatusBar();
  }
}

function stopServer() {
  // 停止心跳
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;

  // 断开全部连接
  allClients.forEach((client, clientId) => {
    const data = { type: "break", clientId: clientId, targetId: targetId, message: "209" };
    client.send(JSON.stringify(data));
    client.close();
    console.log("断开与客户端" + clientId + "的连接：", client);
  });
  allClients.clear();
  boundClients.clear();

  // 关闭服务器
  if (wss) {
    wss.close(() => {
      vscode.window.showInformationMessage("WebSocket服务器已关闭");
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
  };

  // 更新状态
  status = 0;
  power.paused = false;
  startServerLock = false;
  updateStatusBar();
}

module.exports = {
  power: () => { return power },
  startServer,
  stopServer,
  switchMode,
  getStatus,
  distributePunishment,
  getConnected,
  wsServer: () => { return wss; },
  regisiter,
};