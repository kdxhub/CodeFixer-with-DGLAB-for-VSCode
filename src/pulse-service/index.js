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
 * 强度管理器
 * 管理左右通道的强度值，与 VSCode 和 DGLAB 完全解耦。
 * 不依赖任何其他模块，可独立使用。
 */
class PowerManager {
  constructor() {
    /** 
     * 每个通道有 3 个强度源：
     *   [0] 代码纠错
     *   [1] 终端纠错
     *   [2] APP 端设置
     */
    this._left = { value: [0, 0, 0], max: 100 };
    this._right = { value: [0, 0, 0], max: 100 };
    this._paused = false;
  }

  /** 是否暂停 */
  get paused() { return this._paused; }

  /** 原始强度数组引用（谨慎使用） */
  get leftValues() { return this._left.value; }
  get rightValues() { return this._right.value; }

  /** 左通道最大强度 */
  get leftMax() { return this._left.max; }
  set leftMax(v) { this._left.max = v; }

  /** 右通道最大强度 */
  get rightMax() { return this._right.max; }
  set rightMax(v) { this._right.max = v; }

  /**
   * 设置左通道某来源的强度值
   * @param {number} index 来源索引 (0-2)
   * @param {number} value 强度值
   */
  setLeft(index, value) {
    this._left.value[index] = value;
  }

  /**
   * 设置右通道某来源的强度值
   * @param {number} index 来源索引 (0-2)
   * @param {number} value 强度值
   */
  setRight(index, value) {
    this._right.value[index] = value;
  }

  /**
   * 获取左通道最终强度（考虑暂停）
   * @returns {number}
   */
  getLeft() {
    if (this._paused) return 0;
    const v = Math.floor(
      this._left.value[0] + this._left.value[1] + this._left.value[2]
    );
    if (v >= this._left.max) return this._left.max;
    if (v <= 0) return 0;
    return v;
  }

  /**
   * 获取右通道最终强度（考虑暂停）
   * @returns {number}
   */
  getRight() {
    if (this._paused) return 0;
    const v = Math.floor(
      this._right.value[0] + this._right.value[1] + this._right.value[2]
    );
    if (v >= this._right.max) return this._right.max;
    if (v <= 0) return 0;
    return v;
  }

  /**
   * 切换暂停状态
   * @returns {boolean} 新的暂停状态
   */
  togglePause() {
    this._paused = !this._paused;
    return this._paused;
  }

  /** 暂停 */
  pause() {
    this._paused = true;
  }

  /** 恢复 */
  resume() {
    this._paused = false;
  }

  /** 重置所有强度值 */
  reset() {
    this._left.value = [0, 0, 0];
    this._right.value = [0, 0, 0];
    this._left.max = 100;
    this._right.max = 100;
    this._paused = false;
  }
}

/**
 * 脉冲管理器
 * 负责获取波形预设数据。
 */
class PulseManager {
  /**
   * 根据名称获取波形数据
   * @param {string} leftPreset 左通道预设名称
   * @param {string} rightPreset 右通道预设名称
   * @returns {[string, string]} [leftData, rightData]
   */
  getPulseData(leftPreset, rightPreset) {
    return [getPreset(leftPreset), getPreset(rightPreset)];
  }
}

module.exports = {
  PowerManager,
  PulseManager,
  ServerStatus,
};
