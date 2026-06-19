const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

/**
 * 服务状态枚举
 * @readonly
 * @enum {number}
 */
const ServerStatus = {
  /** 服务器关闭 */
  STOPPED: 0,
  /** 暂停 */
  PAUSED: 1,
  /** 工作中（有已绑定的 APP） */
  WORKING: 2,
  /** 无 APP 连接 */
  IDLE: 3,
  /** 异常 */
  ERROR: -1,
};

/**
 * WebSocket 服务器
 * 负责 WebSocket 生命周期、心跳、脉冲下发、消息路由。
 * 依赖注入：ConnectionManager, PowerManager, PulseManager, ConfigManager
 * 通过回调通知上层（VSCodeUI）执行 UI 操作，自身不依赖 vscode API。
 */
class WebSocketServer {
  /**
   * @param {import('../connection-manager/index.js').ConnectionManager} connectionManager
   * @param {import('../pulse-service/index.js').PowerManager} powerManager
   * @param {import('../pulse-service/index.js').PulseManager} pulseManager
   * @param {import('../config-manager/index.js').ConfigManager} configManager
   */
  constructor(connectionManager, powerManager, pulseManager, configManager) {
    this._cm = connectionManager;
    this._pm = powerManager;
    this._pulseMgr = pulseManager;
    this._config = configManager;

    /** @type {WebSocket.Server|null} */
    this._wss = null;
    /** @type {NodeJS.Timeout|null} */
    this._heartbeatInterval = null;
    /** @type {NodeJS.Timeout|null} */
    this._pulseInterval = null;

    // ── 回调钩子 ──
    /** @type {function} 状态变更 */
    this._onStatusChange = null;
    /** @type {function} 显示连接二维码 */
    this._onShowConnect = null;
    /** @type {function} 显示信息消息 */
    this._onInfo = null;
    /** @type {function} 显示警告消息 */
    this._onWarn = null;
    /** @type {function} 显示错误消息 */
    this._onError = null;
    /** @type {function} 显示模态确认对话框，返回 Promise<boolean> */
    this._onConfirm = null;
  }

  /** 原始 wss 实例 */
  get rawServer() { return this._wss; }

  // ── 回调注册 ──

  /**
   * @param {(status: number) => void} cb
   */
  onStatusChange(cb) { this._onStatusChange = cb; }

  /**
   * @param {() => void} cb
   */
  onShowConnect(cb) { this._onShowConnect = cb; }

  /**
   * @param {(msg: string) => void} cb
   */
  onInfo(cb) { this._onInfo = cb; }

  /**
   * @param {(msg: string) => void} cb
   */
  onWarn(cb) { this._onWarn = cb; }

  /**
   * @param {(msg: string) => void} cb
   */
  onError(cb) { this._onError = cb; }

  /**
   * @param {(msg: string) => Promise<boolean>} cb 返回用户是否确认
   */
  onConfirm(cb) { this._onConfirm = cb; }

  // ── 内部通知 ──

  _notifyStatus(s) { if (this._onStatusChange) this._onStatusChange(s); }
  _notifyShowConnect() { if (this._onShowConnect) this._onShowConnect(); }
  _notifyInfo(msg) { if (this._onInfo) this._onInfo(msg); }
  _notifyWarn(msg) { if (this._onWarn) this._onWarn(msg); }
  _notifyError(msg) { if (this._onError) this._onError(msg); }
  async _notifyConfirm(msg) { return this._onConfirm ? this._onConfirm(msg) : true; }

  // ── 强度下发 ──

  /**
   * 下发强度配置给所有已绑定的 APP
   */
  distributePunishment() {
    if (!this._cm.hasBound) return;
    const sid = this._cm.serverId;
    this._cm.broadcastBound((appId, client) => {
      client.send(JSON.stringify({
        type: 'msg', clientId: sid, targetId: appId,
        message: `strength-1+2+${this._pm.getLeft()}`,
      }));
      client.send(JSON.stringify({
        type: 'msg', clientId: sid, targetId: appId,
        message: `strength-2+2+${this._pm.getRight()}`,
      }));
    });
  }

  // ── 服务器生命周期 ──

  /**
   * 启动服务器（对外，带确认对话框）
   */
  async startServer() {
    console.info('触发服务器开启流程');
    const ok = await this._notifyConfirm(this._getWarnMsg());
    if (ok) {
      this._startInternal();
    } else {
      console.warn('用户中断了服务器开启流程');
    }
  }

  /**
   * 启动服务器（内部）
   */
  _startInternal() {
    const port = this._config.serverPort;
    try {
      this._pm.resume();
      this._wss = new WebSocket.Server({ port });

      this._wss.on('listening', () => {
        this._notifyStatus(ServerStatus.IDLE);
        this._notifyInfo(`WebSocket服务器已启动，端口: ${port}`);
        console.log(`成功启动WebSocket服务器 @ ws://localhost:${port}`);
        this._startTimers();
      });

      this._wss.on('connection', (ws) => this._handleConnection(ws));

      this._wss.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this._notifyError(`端口 ${port} 已被占用，请更换端口。`);
        }
        console.error('WebSocket 服务器错误:', error);
        this._notifyStatus(ServerStatus.ERROR);
      });
    } catch (error) {
      console.error('无法启动DGLAB WebSocket服务器：', error);
      this._notifyError(`无法启动WebSocket服务器：${error.message}`);
      this._notifyStatus(ServerStatus.ERROR);
    }
  }

  /**
   * 停止服务器
   */
  stopServer() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._pulseInterval) {
      clearInterval(this._pulseInterval);
      this._pulseInterval = null;
    }

    this._pm.reset();

    // 断开全部连接
    const sid = this._cm.serverId;
    this._cm.broadcastAll((clientId, client) => {
      client.send(JSON.stringify({
        type: 'break', clientId, targetId: sid, message: '209',
      }));
      client.close();
    });
    this._cm.clear();

    if (this._wss) {
      this._wss.close(() => {
        console.log('WebSocket服务器已关闭');
      });
      this._wss = null;
    }

    this._notifyInfo('WebSocket服务器已关闭');
    this._notifyStatus(ServerStatus.STOPPED);
  }

  /**
   * 状态切换
   */
  switchMode() {
    const s = this.getStatus();
    switch (s) {
      case ServerStatus.STOPPED:
        this.startServer();
        break;
      case ServerStatus.PAUSED:
        this._pm.resume();
        this._notifyStatus(this._getCurrentStatus());
        this._notifyInfo('服务恢复');
        break;
      case ServerStatus.WORKING:
        this._pm.pause();
        this._notifyStatus(ServerStatus.PAUSED);
        this._notifyInfo('已暂停服务');
        break;
      case ServerStatus.IDLE:
        this._notifyShowConnect();
        break;
      default:
        this.stopServer();
        break;
    }
  }

  /**
   * 强制暂停（由 APP 按键触发）
   * @param {string} reason
   */
  forcePause(reason) {
    if (this._pm.paused || !this._wss) return;
    this._pm.pause();
    this._notifyStatus(ServerStatus.PAUSED);
    this._notifyInfo(`已自动暂停。${reason}`);
  }

  /**
   * 获取当前服务器状态
   * @returns {number}
   */
  getStatus() {
    if (!this._wss) return ServerStatus.STOPPED;
    return this._getCurrentStatus();
  }

  // ── 定时器 ──

  _startTimers() {
    const sid = this._cm.serverId;

    if (!this._heartbeatInterval) {
      this._heartbeatInterval = setInterval(() => {
        if (!this._cm.hasAny) return;
        console.log('向', this._cm.totalCount, '个客户端发送心跳：', new Date().toLocaleString());
        this._cm.broadcastAll((clientId, client) => {
          client.send(JSON.stringify({
            type: 'heartbeat', clientId, targetId: sid, message: '200',
          }));
        });
        this.distributePunishment();
      }, 60 * 1000);
    }

    if (!this._pulseInterval) {
      this._pulseInterval = setInterval(() => {
        if (!this._cm.hasBound) return;
        const pulse = this._pulseMgr.getPulseData(
          this._config.pulseLeft,
          this._config.pulseRight
        );
        const sid = this._cm.serverId;
        this._cm.broadcastBound((appId, client) => {
          client.send(JSON.stringify({
            type: 'msg', clientId: sid, targetId: appId, message: 'clear-A',
          }));
          client.send(JSON.stringify({
            type: 'msg', clientId: sid, targetId: appId, message: 'clear-B',
          }));
          if (this._pm.paused) return;
          client.send(JSON.stringify({
            type: 'msg', clientId: sid, targetId: appId, message: 'pulse-A:' + pulse[0],
          }));
          client.send(JSON.stringify({
            type: 'msg', clientId: sid, targetId: appId, message: 'pulse-B:' + pulse[1],
          }));
        });
      }, 1000);
    }
  }

  // ── 连接处理 ──

  _handleConnection(ws) {
    const clientId = uuidv4();
    console.log('新的 WebSocket 连接已建立，标识符为:', clientId);
    this._cm.add(clientId, ws);

    ws.send(JSON.stringify({
      type: 'bind', clientId, targetId: '', message: 'targetId',
    }));

    ws.on('message', (ev) => this._handleMessage(ws, ev));
    ws.on('close', () => this._handleClose(ws));
    ws.on('error', (err) => this._handleError(ws, err));
  }

  _handleMessage(ws, ev) {
    const id = `#${Math.floor(Math.random() * 1e6)}`;
    console.log(`[normal]收到消息${id}：`, ev);

    let data;
    try {
      data = JSON.parse(ev.toString());
    } catch (e) {
      console.warn(`消息${id} 无效：`, e);
      ws.send(JSON.stringify({ type: 'msg', clientId: '', targetId: '', message: '403' }));
      return;
    }

    // ── 绑定请求 ──
    if (data.type === 'bind') {
      if (data.message === 'DGLAB') {
        this._cm.bind(data.targetId, ws);
        ws.send(JSON.stringify({
          type: 'bind',
          clientId: data.clientId,
          targetId: this._cm.serverId,
          message: '200',
        }));
        if (!this._pm.paused) this._notifyStatus(ServerStatus.WORKING);
        console.log(`绑定成功：APP ${data.targetId} 已绑定到控制端`);
      }
      return;
    }

    // 检查来源合法性
    if (this._cm.findClientIdByWs(ws) !== data.targetId) {
      console.warn(`消息${id} 无效，来源不正确。`);
      ws.send(JSON.stringify({ type: 'msg', clientId: '', targetId: '', message: '404' }));
      return;
    }

    // ── APP 反馈（按钮按下 → 强制暂停）──
    if (data.type === 'msg' && data.message.startsWith('feedback-') && !this._pm.paused) {
      this.forcePause('APP按钮被点击。');
      return;
    }

    // ── APP 反馈强度 ──
    if (data.type === 'msg' && data.message.startsWith('strength-')) {
      const strengths = data.message.replace('strength-', '').split('+').map(Number);
      if (strengths.length !== 4) {
        console.warn(`消息${id} 无效，反馈强度格式不正确。`);
        return;
      }
      // 更新硬上限（来自 APP 端设备设定）
      this._pm.hardLimit = Math.max(strengths[2], strengths[3]);

      // 通过事件 API 更新 APP 设置事件
      const appLeft = this._pm.getEvent('_app_left');
      const appRight = this._pm.getEvent('_app_right');
      const curLeft = this._pm.getLeft();
      const curRight = this._pm.getRight();
      const appLeftVal = appLeft ? appLeft.value : 0;
      const appRightVal = appRight ? appRight.value : 0;

      if (strengths[0] === curLeft + 1) {
        const newVal = appLeftVal + 1;
        if (appLeft) { appLeft.value = newVal; }
        else { this._pm.addEvent({ id: '_app_left', channel: 'left', value: newVal, category: 'persistent', label: 'APP设置' }); }
      }
      if (strengths[1] === curRight + 1) {
        const newVal = appRightVal + 1;
        if (appRight) { appRight.value = newVal; }
        else { this._pm.addEvent({ id: '_app_right', channel: 'right', value: newVal, category: 'persistent', label: 'APP设置' }); }
      }
      if (strengths[0] === curLeft - 1) {
        const newVal = Math.max(0, appLeftVal - 1);
        if (appLeft) { appLeft.value = newVal; }
        else { this._pm.addEvent({ id: '_app_left', channel: 'left', value: newVal, category: 'persistent', label: 'APP设置' }); }
      }
      if (strengths[1] === curRight - 1) {
        const newVal = Math.max(0, appRightVal - 1);
        if (appRight) { appRight.value = newVal; }
        else { this._pm.addEvent({ id: '_app_right', channel: 'right', value: newVal, category: 'persistent', label: 'APP设置' }); }
      }

      console.log('[normal]APP 强度反馈已处理，当前事件:', this._pm.getAllEvents());
      this._notifyStatus(this._getCurrentStatus());
      return;
    }
  }

  _handleClose(ws) {
    console.log('WebSocket 连接已关闭');
    const hadBound = this._cm.hasBound;
    this._cm.removeByWs(ws);

    if (hadBound && !this._cm.hasBound) {
      if (!this._pm.paused) this._notifyStatus(ServerStatus.IDLE);
      this._notifyInfo('所有客户端已断开连接。');
    } else {
      this._notifyInfo(`有客户端断开连接，目前还有 ${this._cm.boundCount} 台设备已绑定。`);
    }
    this._notifyStatus(this._getCurrentStatus());
  }

  _handleError(ws, error) {
    console.error('WebSocket 连接错误：', error);
    this._cm.removeByWs(ws);
    this._notifyWarn(`客户端连接错误：${error.message}`);
    this._notifyStatus(this._getCurrentStatus());
  }

  // ── 状态计算 ──

  _getCurrentStatus() {
    if (this._pm.paused) return ServerStatus.PAUSED;
    if (this._cm.hasBound) return ServerStatus.WORKING;
    if (!this._cm.hasAny) return ServerStatus.IDLE;
    return ServerStatus.STOPPED;
  }

  _getWarnMsg() {
    return `欢迎使用本插件。在继续操作前，请仔细阅读以下注意事项，充分了解相关风险：
1. 功能说明：本插件通过联动 DG-LAB 设备，将 VSCode 中的特定状态转换为电击强度，从而对您施加电刺激。
2. 潜在风险：使用过程中可能因 VSCode 中状态数据过大等，导致您接收到超出预期的过量电刺激。
3. 安全设置：请务必在 DG-LAB 客户端中预先设置最大电击强度，以降低意外风险。但请注意，该设置并不能完全杜绝所有意外情况。
4. 用法警告：正如 DG-LAB 产品所声明的那样，请保证使用者知情同意、安全且清醒，位于非潮湿环境中，同时没有任何不适疾病；严禁将电极片置于皮肤破损处、肚脐眼上方等位置，以免电流导致生命危险；严禁在本插件未暂停时移动电极片和操作器械等。
5. 使用建议：为保障您的健康，建议单次在同一部位的连续使用不超过 30 分钟，并适时休息，避免皮肤或身体因长时间刺激而产生不适。
6. 停止条件：若您在过程中感到任何不适或无法接受当前刺激，请立即停止插件运行。
7. 免责声明：一旦使用本插件，即表示您已知悉并自愿承担上述所有风险。VSCode著作权人、本插件作者及相关贡献者均不对因使用本插件而产生的任何后果承担任何法律责任。
请确认您已认真阅读并理解以上内容。
 
同时，请知悉：按下 APP端任意按键 或 Ctrl+Alt+空格 （MacOS请换成Cmd+Alt+空格，可修改）可以强制暂停。`;
  }
}

module.exports = { WebSocketServer };
