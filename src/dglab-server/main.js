const vscode = require('vscode');
const WebScoket = require('ws');
const conf = require('../config.js');
const { v4: uuidv4 } = require('uuid');

// 存储变量
/**
 * @see {@link getStatus()}
 */
var status = 0;
/**
 * @type {WebScoket.Server}
 */
var wss;
/** 储存已连接的用户及其标识 */
const clients = new Map();
/** 存储客户端和发送计时器关系 */
const clientTimers = new Map();
/** 心跳消息 */
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
 * 由于本插件既有服务器又有前端功能，所以实际上所有客户端都因绑定到一个固定的uuid上
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
`;

/* 注册回调函数并保证基本能用 */
let updateStatusBar = function () { return; } ;
let showConnect = function (param1) { return; } ;
function regisiter(updateStatusBarFunc, showConnectFunc) {
  updateStatusBar = updateStatusBarFunc;
  showConnect = showConnectFunc;
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
function getConnected() { return clients.size; };

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
      status = (getConnected() <= 0) ? 3 : 2;
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
  if (startServerLock)/* 异步会话锁，防止重复启动服务器 */ {
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
}

function startServerInternal() {
  let port = conf.server.port();
  try {
    power.paused = false;
    wss = new WebScoket.Server({ port });

    // 启动成功
    wss.on('listening', () => {
      status = 3;
      vscode.window.showInformationMessage(`WebSocket服务器已启动，端口: ${port}`);
      console.log(`成功启动WebScoket服务器 @ ws://localhost:${port}`);
      updateStatusBar();
    });

    // 启动心跳定时器
    if (!heartbeatInterval) {
      heartbeatInterval = setInterval(() => {
        // 遍历 clients Map（大于0个链接），向每个客户端发送心跳消息
        if (getConnected() > 0) {
          console.log("向 ",getConnected(), ' 个客户端发送心跳消息：' + new Date().toLocaleString());
          clients.forEach((client, clientId) => {
            heartbeatMsg.clientId = clientId;
            heartbeatMsg.targetId = targetId;
            client.send(JSON.stringify(heartbeatMsg));
          });
        }
      }, 60 * 1000); // 每分钟发送一次心跳消息
    }

    // 注册连接事件
    wss.on('connection', (ws) => {
      // 存储连接并更新显示
      const clientId = uuidv4();
      console.log('新的 WebSocket 连接已建立，标识符为:', clientId);
      clients.set(clientId, ws);
      if (!power.paused/* 暂停时不更新状态 */) { status = 2; };
      updateStatusBar();
 
      // 握手
      ws.send(JSON.stringify({ type: 'bind', clientId, message: 'targetId', targetId: '' }));

      // 确立后续协议
      ws.on('message', (ev) => {
        // 收到消息时开始解析
        const id = `#${Math.floor(Math.random() * 1e6)}`;
        console.log(`收到消息${id} ：` + ev);
        let data = null;
        try {
          // @ts-ignore
          data = JSON.parse(ev);
        } catch (e) {
          // 非JSON数据处理
          console.warn(`消息${id} 无效：`, e);
          ws.send(JSON.stringify({ type: 'msg', clientId: "", targetId: "", message: /* 虽然403是无权限，但官方文档是这么写的 */'403' }));
          return;
        };
        // 文档定义了这个消息体，保留但忽略
        // const { clientId, targetId, message, type } = data;

        // 非法消息来源拒绝
        if (clients.get(data.clientId) !== ws && clients.get(data.targetId) !== ws) {
          console.warn(`消息${id} 无效，其来源不正确。`);
          ws.send(JSON.stringify({ type: 'msg', clientId: "", targetId: "", message: /* 同理与文档保持一致 */'404' }));
          return;
        };

        // 申请绑定
        if (data.type === "bind") {
          const sendData = { clientId, targetId, message: "200", type: "bind" }
          ws.send(JSON.stringify(sendData));
          return;
        };

        // 下发惩罚配置
        // if (data.type === "punishmentConfig") {
        //   if (!data.channel) {
        //     const errorData = { type: "error", clientId: data.clientId, targetId: data.targetId, message: "406-channel is empty" };
        //     ws.send(JSON.stringify(errorData));
        //     return;
        //   };

        //   if (clients.has(data.targetId)) {
        //     const target = clients.get(data.targetId);
        //     const sendtime = data.time ? data.time : 5; // 默认发送时间 5 秒
        //     const sendStrength = data.channel === "A" ? power.left.get() : power.right.get();
        //     const sendData = { type: "msg", clientId: data.clientId, targetId: data.targetId, message: `pulse-${sendStrength}` };
        //     const totalSends = 1 * sendtime; // 默认每秒发送一次
        //     const timeSpace = 1000; // 每秒发送一次

        //     if (clientTimers.has(data.clientId + "-" + data.channel)) {
        //       console.log(`通道 ${data.channel} 覆盖消息发送中，总消息数：${totalSends} 持续时间：${sendtime}`);
        //       ws.send(`当前通道 ${data.channel} 有正在发送的消息，覆盖之前的消息`);

        //       const timerId = clientTimers.get(data.clientId + "-" + data.channel);
        //       clearInterval(timerId);
        //       clientTimers.delete(data.clientId + "-" + data.channel);

        //       const clearData = { clientId: data.clientId, targetId: data.targetId, message: `clear-${data.channel === "A" ? 1 : 2}`, type: "msg" };
        //       target.send(JSON.stringify(clearData));

        //       setTimeout(() => {
        //         delaySendMsg(data.clientId, ws, target, sendData, totalSends, timeSpace, data.channel);
        //       }, 150);
        //     } else {
        //       delaySendMsg(data.clientId, ws, target, sendData, totalSends, timeSpace, data.channel);
        //       console.log(`通道 ${data.channel} 消息发送中，总消息数：${totalSends} 持续时间：${sendtime}`);
        //     };
        //   } else {
        //     console.log(`未找到匹配的客户端，clientId: ${data.clientId}`);
        //     const errorData = { clientId: data.clientId, targetId: data.targetId, message: "404", type: "msg" };
        //     ws.send(JSON.stringify(errorData));
        //   };
        //   return;
        // }
      });

      ws.on('close', () => {
        // 连接关闭时，准备清除数据
        console.log('WebSocket 连接已关闭');
        let clientId = '';
        clients.forEach((value, key) => {// 遍历 clients Map，找到并删除对应的 clientId 条目
          if (value === ws) {
            // 拿到断开的客户端id
            clientId = key;
          };
        });

        // 开始清除数据
        console.log("断开的client id:" + clientId);
        const data = { type: "break", clientId, targetId: "", message: "209" }
        ws.send(JSON.stringify(data));
        ws.close();
        clients.delete(clientId);
        console.log("已清除" + clientId + " ,当前剩余连接数: " + clients.size);
        
        // 更新信息
        if (getConnected() <= 0) {
          if (!power.paused) { status = 3; };
          vscode.window.showInformationMessage("当前所有客户端已断开连接。");
        } else {
          vscode.window.showInformationMessage(`有客户端断开了连接，目前还有 ${getConnected()} 台设备连接。`);
        };
        updateStatusBar();
      });

      ws.on('error', (error) => {
        // 静默销毁连接
        let clientId = null;
        for (const [key, value] of clients.entries()) {
          if (value === ws) {
            clientId = key;
            clients.delete(clientId);
            console.log("已清除" + clientId + " ,当前剩余连接数: " + clients.size);
            break;
          };
        };

        // 更新信息
        vscode.window.showWarningMessage(`有客户端请求连接但无法连接：${error.message}`);
        console.error("有客户端请求连接但无法连接：", error);
        updateStatusBar();
      });
    });

    // 注册错误处理
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
    console.error("无法启动DGLAB WebScoket服务器：", error);
    vscode.window.showErrorMessage(`无法启动WebScoket服务器：${error.message}`);
    updateStatusBar();
  }
}

function delaySendMsg(clientId, client, target, sendData, totalSends, timeSpace, channel) {
  // 发信计时器 通道会分别发送不同的消息和不同的数量 必须等全部发送完才会取消这个消息 新消息可以覆盖
  target.send(JSON.stringify(sendData)); //立即发送一次通道的消息
  totalSends--;
  if (totalSends > 0) {
    return new Promise((resolve, reject) => {
      // 按频率发送消息给特定的客户端
      const timerId = setInterval(() => {
        if (totalSends > 0) {
          target.send(JSON.stringify(sendData));
          totalSends--;
        }
        // 如果达到发送次数上限，则停止定时器
        if (totalSends <= 0) {
          clearInterval(timerId);
          client.send("发送完毕")
          clientTimers.delete(clientId); // 删除对应的定时器
          resolve();
        }
      }, timeSpace); // 每隔频率倒数触发一次定时器

      // 存储clientId与其对应的timerId和通道
      clientTimers.set(clientId + "-" + channel, timerId);
    });
  }
}

function stopServer() {
  // 停止心跳
  clearInterval(heartbeatInterval);
  heartbeatInterval = null;

  // 断开全部连接
  clients.forEach((value, key) => {
    const data = { type: "break", clientId: key, targetId, message: "209" }
    value.send(JSON.stringify(data));
    value.close();
    console.log("断开与客户端" + key + "的连接：", value);
  });

  // 关闭服务器
  if (wss) {
    wss.close(() => {
      vscode.window.showInformationMessage("WebScoket服务器已关闭");
    });
  } else {
    vscode.window.showInformationMessage("尚未启动服务器");
  };

  // 更新状态
  status = 0;
  power.paused = false;
  startServerLock/* 解除会话锁 */ = false;
  updateStatusBar();
}

module.exports = {
  power: () => { return power },
  startServer,
  stopServer,
  switchMode,
  getStatus,
  getConnected,
  wsServer: () => { return wss; },
  regisiter,
}