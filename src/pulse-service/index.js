const { getPreset } = require('./presets');

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
 * 强度事件
 * 表示一个独立的强度贡献源。
 * - persistent: 长期有效，不过期，可通过 updateEvent 修改
 * - temporary: 临时叠加，duration 到期后自动移除
 */
class IntensityEvent {
  /**
   * @param {object} opts
   * @param {string} opts.id          全局唯一标识
   * @param {'left'|'right'|'both'} opts.channel  目标通道
   * @param {number} opts.value       强度值
   * @param {'persistent'|'temporary'} [opts.category='persistent']  事件类型
   * @param {string} [opts.label='']  人类可读标签
   * @param {number} [opts.duration]  临时事件持续时间（ms）
   */
  constructor(opts) {
    this.id = opts.id;
    this.channel = opts.channel;
    this._value = opts.value;
    this.category = opts.category || 'persistent';
    this.label = opts.label || '';
    this.createdAt = Date.now();
    this.expiresAt = opts.duration ? Date.now() + opts.duration : null;
    /** @type {NodeJS.Timeout|null} */
    this._timer = null;
  }

  get value() { return this._value; }
  set value(v) { this._value = v; }

  get expired() {
    return this.expiresAt !== null && Date.now() >= this.expiresAt;
  }

  get isTemporary() { return this.category === 'temporary'; }

  toJSON() {
    return {
      id: this.id,
      channel: this.channel,
      value: this._value,
      category: this.category,
      label: this.label,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
    };
  }
}

/**
 * 强度管理器（事件驱动版）
 *
 * 最终强度 = sum(所有匹配通道的事件值) → clamp 到 [0, hardLimit]
 *
 * 使用方式：
 * ```js
 * // 长期事件（诊断用）
 * pm.addEvent({ id: 'diag-left', channel: 'left', value: 30, category: 'persistent', label: '诊断' });
 * // 临时事件（终端用，1000ms后自动移除）
 * pm.addEvent({ id: 'term-xxx', channel: 'left', value: 15, category: 'temporary', duration: 1000, label: '终端' });
 * // 修改已有事件值
 * pm.updateEvent('diag-left', 50);
 * // 移除事件
 * pm.removeEvent('term-xxx');
 * // 获取最终强度（自动叠加，clamp）
 * pm.getLeft();
 * ```
 */
class PowerManager {
  constructor() {
    /** @type {Map<string, IntensityEvent>} */
    this._events = new Map();
    /** 硬上限，任何情况下最终强度不可超过此值 */
    this._hardLimit = 100;
    this._paused = false;
  }

  // ── 基础属性 ──

  get paused() { return this._paused; }
  get hardLimit() { return this._hardLimit; }
  set hardLimit(v) { this._hardLimit = v; }

  /** 向后兼容 */
  get leftMax() { return this._hardLimit; }
  set leftMax(v) { this._hardLimit = v; }
  get rightMax() { return this._hardLimit; }
  set rightMax(v) { this._hardLimit = v; }

  /**
   * 向后兼容：各来源当前强度快照（用于读取）
   * { 0: code值, 1: 终端总值, 2: app值 }
   */
  get leftValues() {
    return {
      0: this._sumEventsBySource('left', '_code'),
      1: this._sumEventsByCategory('left', 'temporary'),
      2: this._getLegacyValue('_app_left'),
    };
  }

  get rightValues() {
    return {
      0: this._sumEventsBySource('right', '_code'),
      1: this._sumEventsByCategory('right', 'temporary'),
      2: this._getLegacyValue('_app_right'),
    };
  }

  // ── 新事件 API ──

  /**
   * 添加一个强度事件
   * @param {object} opts
   * @param {string} opts.id 事件ID，若重复会更新该事件
   * @param {'left'|'right'|'both'} opts.channel 强度叠加通道
   * @param {number} opts.value 叠加强度数值
   * @param {'persistent'|'temporary'} [opts.category='persistent'] 强度类型
   * @param {string} [opts.label] 人类可读标签
   * @param {number} [opts.duration]  临时事件过期时长（ms）
   * @param {function} [opts.onExpire] 过期回调
   * @returns {IntensityEvent}
   */
  addEvent(opts) {
    if (this._events.has(opts.id)) {
      console.warn(`强度事件 "${opts.id}" 已存在，将更新其值`);
      this._events.get(opts.id).value = opts.value;
      return this._events.get(opts.id);
    }

    const event = new IntensityEvent({
      id: opts.id,
      channel: opts.channel,
      value: opts.value,
      category: opts.category || 'persistent',
      label: opts.label || '',
      duration: opts.duration || null,
    });

    if (event.isTemporary && event.expiresAt) {
      const remaining = event.expiresAt - Date.now();
      if (remaining <= 0) {
        console.warn(`强度事件 "${opts.id}" 持续时间已过，跳过`);
        return event;
      }
      event._timer = setTimeout(() => {
        this._events.delete(event.id);
        if (opts.onExpire) opts.onExpire(event);
        console.log(`临时强度事件 "${event.id}" 已过期自动移除`);
      }, remaining);
    }

    this._events.set(event.id, event);
    console.log(`添加强度事件:`, JSON.stringify(event.toJSON()));
    return event;
  }

  /**
   * 移除一个强度事件
   * @param {string} id
   * @returns {boolean}
   */
  removeEvent(id) {
    const event = this._events.get(id);
    if (!event) return false;
    if (event._timer) clearTimeout(event._timer);
    this._events.delete(id);
    console.log(`移除强度事件: "${id}"`);
    return true;
  }

  /**
   * 更新长期事件的强度值
   * @param {string} id
   * @param {number} value
   * @returns {boolean}
   */
  updateEvent(id, value) {
    const event = this._events.get(id);
    if (!event) {
      console.warn(`强度事件 "${id}" 不存在`);
      return false;
    }
    if (event.category !== 'persistent') {
      console.warn(`强度事件 "${id}" 不是长期事件，请用 addEvent/removeEvent`);
      return false;
    }
    event.value = value;
    console.log(`更新强度事件 "${id}": ${value}`);
    return true;
  }

  /** @param {string} id */
  getEvent(id) { return this._events.get(id); }

  /** @param {string} id */
  hasEvent(id) { return this._events.has(id); }

  /** 获取所有事件快照 */
  getAllEvents() {
    return Array.from(this._events.values()).map(e => e.toJSON());
  }

  /** 清空所有事件 */
  clearAllEvents() {
    for (const event of this._events.values()) {
      if (event._timer) clearTimeout(event._timer);
    }
    this._events.clear();
    console.log('已清空所有强度事件');
  }

  // ── 最终强度计算 ──

  /**
   * 获取左通道最终强度
   * 叠加所有 left/both 事件 → clamp 到 [0, hardLimit]
   * @returns {number}
   */
  getLeft() {
    if (this._paused) return 0;
    return this._calcChannel('left');
  }

  /**
   * 获取右通道最终强度
   * @returns {number}
   */
  getRight() {
    if (this._paused) return 0;
    return this._calcChannel('right');
  }

  /**
   * 计算通道叠加值
   * @param {'left'|'right'} channel
   * @returns {number}
   */
  _calcChannel(channel) {
    // 先清理过期事件
    const expired = [];
    for (const [id, event] of this._events) {
      if (event.expired) expired.push(id);
    }
    for (const id of expired) {
      const ev = this._events.get(id);
      if (ev && ev._timer) clearTimeout(ev._timer);
      this._events.delete(id);
    }

    // 叠加
    let sum = 0;
    for (const event of this._events.values()) {
      if (event.channel === 'both' || event.channel === channel) {
        sum += event.value;
      }
    }

    // 绝对不能超过硬上限
    return Math.min(Math.max(Math.floor(sum), 0), this._hardLimit);
  }

  // ── 内部辅助 ──

  _sumEventsBySource(channel, prefix) {
    let sum = 0;
    for (const [id, ev] of this._events) {
      if (id.startsWith(prefix) && (ev.channel === channel || ev.channel === 'both')) {
        sum += ev.value;
      }
    }
    return sum;
  }

  _sumEventsByCategory(channel, category) {
    let sum = 0;
    for (const ev of this._events.values()) {
      if (ev.category !== category) continue;
      if (ev.channel === channel || ev.channel === 'both') {
        sum += ev.value;
      }
    }
    return sum;
  }

  _getLegacyValue(id) {
    const ev = this._events.get(id);
    return ev ? ev.value : 0;
  }

  // ── 向后兼容 API ──

  /**
   * 设置左通道某来源的强度值（向后兼容）
   * @param {number} index 0=代码纠错, 1=终端纠错, 2=APP设置
   * @param {number} value
   */
  setLeft(index, value) {
    switch (index) {
      case 0:
        this._upsertPersistent('_code_left', 'left', value, '代码纠错');
        break;
      case 1:
        this._ensureTempEvent('_term_left', 'left', value);
        break;
      case 2:
        this._upsertPersistent('_app_left', 'left', value, 'APP设置');
        break;
    }
  }

  /**
   * 设置右通道某来源的强度值（向后兼容）
   * @param {number} index
   * @param {number} value
   */
  setRight(index, value) {
    switch (index) {
      case 0:
        this._upsertPersistent('_code_right', 'right', value, '代码纠错');
        break;
      case 1:
        this._ensureTempEvent('_term_right', 'right', value);
        break;
      case 2:
        this._upsertPersistent('_app_right', 'right', value, 'APP设置');
        break;
    }
  }

  _upsertPersistent(id, channel, value, label) {
    const existing = this._events.get(id);
    if (existing) {
      existing.value = value;
    } else {
      this.addEvent({ id, channel, value, category: 'persistent', label });
    }
  }

  /** 旧版 setLeft/Right(1, val) 用——单临时事件覆盖模式 */
  _ensureTempEvent(id, channel, value) {
    const existing = this._events.get(id);
    if (existing) {
      existing.value = value;
    } else {
      this.addEvent({ id, channel, value, category: 'temporary', label: '终端纠错（旧版）', duration: 0 });
    }
  }

  // ── 生命周期 ──

  togglePause() { this._paused = !this._paused; return this._paused; }
  pause() { this._paused = true; }
  resume() { this._paused = false; }

  /** 重置全部状态 */
  reset() {
    this.clearAllEvents();
    this._hardLimit = 100;
    this._paused = false;
  }
}

/**
 * 脉冲管理器
 */
class PulseManager {
  getPulseData(leftPreset, rightPreset) {
    return [getPreset(leftPreset), getPreset(rightPreset)];
  }
}

module.exports = {
  PowerManager,
  PulseManager,
  ServerStatus,
  IntensityEvent,
};
