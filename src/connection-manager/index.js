/**
 * 连接管理器
 * 管理 WebSocket 客户端连接状态，与网络层完全解耦。
 * 纯数据层，不处理任何 I/O。
 */
class ConnectionManager {
  /**
   * @param {string} serverId 插件自身的固定 ID
   */
  constructor(serverId) {
    this._serverId = serverId;
    /** @type {Map<string, any>} 所有已连接的客户端（含未绑定） */
    this._allClients = new Map();
    /** @type {Map<string, any>} 已绑定的客户端（APP） */
    this._boundClients = new Map();
  }

  /** 插件自身 ID */
  get serverId() { return this._serverId; }

  /** 所有客户端数量 */
  get totalCount() { return this._allClients.size; }

  /** 已绑定客户端数量 */
  get boundCount() { return this._boundClients.size; }

  /** 所有客户端迭代器 */
  get allEntries() { return this._allClients.entries(); }

  /** 已绑定客户端迭代器 */
  get boundEntries() { return this._boundClients.entries(); }

  /** 所有客户端是否存在 */
  get hasAny() { return this._allClients.size > 0; }

  /** 已绑定客户端是否存在 */
  get hasBound() { return this._boundClients.size > 0; }

  /**
   * 添加一个新客户端连接
   * @param {string} clientId 
   * @param {any} ws 
   */
  add(clientId, ws) {
    this._allClients.set(clientId, ws);
  }

  /**
   * 绑定一个客户端为 APP
   * @param {string} appId 
   * @param {any} ws 
   */
  bind(appId, ws) {
    this._boundClients.set(appId, ws);
  }

  /**
   * 通过 WebSocket 实例查找 clientId
   * @param {any} ws 
   * @returns {string|null}
   */
  findClientIdByWs(ws) {
    for (const [id, client] of this._allClients) {
      if (client === ws) return id;
    }
    return null;
  }

  /**
   * 移除一个客户端连接（同时从 all 和 bound 中移除）
   * @param {any} ws 
   * @returns {string|null} 被移除的 clientId
   */
  removeByWs(ws) {
    let removedId = null;
    for (const [id, client] of this._allClients) {
      if (client === ws) {
        this._allClients.delete(id);
        this._boundClients.delete(id);
        removedId = id;
        break;
      }
    }
    return removedId;
  }

  /**
   * 移除指定 clientId 的客户端
   * @param {string} clientId 
   */
  removeById(clientId) {
    this._allClients.delete(clientId);
    this._boundClients.delete(clientId);
  }

  /** 清空所有连接 */
  clear() {
    this._boundClients.clear();
    this._allClients.clear();
  }

  /**
   * 向所有已绑定客户端发送消息
   * @param {(appId: string, ws: any) => void} sender 
   */
  broadcastBound(sender) {
    for (const [appId, ws] of this._boundClients) {
      sender(appId, ws);
    }
  }

  /**
   * 向所有客户端（含未绑定）发送消息
   * @param {(clientId: string, ws: any) => void} sender 
   */
  broadcastAll(sender) {
    for (const [clientId, ws] of this._allClients) {
      sender(clientId, ws);
    }
  }
}

module.exports = { ConnectionManager };
