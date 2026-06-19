const vscode = require('vscode');
const os = require('os');

/**
 * 配置管理器
 * 负责所有 VS Code 设置项的读取，不依赖其他模块。
 */
class ConfigManager {
  constructor() {
    this._namespace = 'codefixer-with-dg-lab';
    this._cache = vscode.workspace.getConfiguration(this._namespace);
  }

  /** 刷新内部配置缓存 */
  refresh() {
    this._cache = vscode.workspace.getConfiguration(this._namespace);
  }

  /** 获取原始配置对象 */
  get raw() {
    return this._cache;
  }

  // ── 代码纠错强度配置 ──
  get codeInfo() {
    return {
      first: this._cache.get('code.infoFirst'),
      every: this._cache.get('code.infoEvery'),
      max: this._cache.get('code.infoMax'),
    };
  }

  get codeWarn() {
    return {
      first: this._cache.get('code.warnFirst'),
      every: this._cache.get('code.warnEvery'),
      max: this._cache.get('code.warnMax'),
    };
  }

  get codeError() {
    return {
      first: this._cache.get('code.errorFirst'),
      every: this._cache.get('code.errorEvery'),
      max: this._cache.get('code.errorMax'),
    };
  }

  /** 代码纠错强度分配模式 */
  get codeMode() {
    return this._cache.get('code.side');
  }

  // ── 终端纠错配置 ──
  get terminalMode() {
    return this._cache.get('terminal.side');
  }

  get terminalIrreversible() {
    return this._cache.get('terminal.inrevertable');
  }

  get terminalRate() {
    return this._cache.get('terminal.rate');
  }

  get terminalDuration() {
    return this._cache.get('terminal.duration');
  }

  get terminalInterrupt() {
    return this._cache.get('terminal.interruptSeeAs');
  }

  get terminalTips() {
    return this._cache.get('terminal.tips');
  }

  // ── 服务器配置 ──
  get serverPort() {
    return this._cache.get('server.port');
  }

  get serverOverrideIp() {
    return this._cache.get('server.override_ip');
  }

  get serverQrSize() {
    return this._cache.get('server.qrcode.size');
  }

  get serverQrCorrectionLevel() {
    return this._cache.get('server.qrcode.correctionLevel');
  }

  // ── 行为反馈回路（Award）配置 ──

  /** 行为反馈强度分配模式 */
  get awardMode() {
    return this._cache.get('award.side');
  }

  /**
   * 获取所有 award 配置的快捷方式
   */
  get award() {
    return {
      debugging: {
        breakpoint: {
          new: {
            act: this._cache.get('award.debugging.breakpoint.new'),
            duration: this._cache.get('award.debugging.breakpoint.new.duration'),
          },
          remove: {
            act: this._cache.get('award.debugging.breakpoint.remove'),
            duration: this._cache.get('award.debugging.breakpoint.remove.duration'),
          },
        },
        start: {
          act: this._cache.get('award.debugging.start.act'),
          duration: this._cache.get('award.debugging.start.duration'),
        },
        stop: {
          act: this._cache.get('award.debugging.stop.act'),
          duration: this._cache.get('award.debugging.stop.duration'),
        },
      },
      typing: {
        act: this._cache.get('award.typing.act'),
        duration: this._cache.get('award.typing.duration'),
      },
      create: {
        act: this._cache.get('award.create.act'),
        duration: this._cache.get('award.create.duration'),
      },
      open: {
        act: this._cache.get('award.open.act'),
        duration: this._cache.get('award.open.duration'),
      },
      save: {
        act: this._cache.get('award.save.act'),
        duration: this._cache.get('award.save.duration'),
      },
      scm: {
        commit: {
          act: this._cache.get('award.scm.commit.act'),
          duration: this._cache.get('award.scm.commit.duration'),
        },
      },
    };
  }

  /** 简写：获取指定 award 的 act/duration */
  awardAct(cfg) { return cfg.act; }
  awardDuration(cfg) { return cfg.duration; }

  // ── 其他设置 ──
  get pulseLeft() {
    return this._cache.get('pulse.left');
  }

  get pulseRight() {
    return this._cache.get('pulse.right');
  }

  get interval() {
    const rawData = this._cache.get("interval");
    if (rawData && rawData > 0) {
      return rawData;
    } else {
      return 200;
    }
  }

  // ── 工具方法 ──
  /**
   * 获取本地非回环 IPv4 地址
   * @returns {string|null}
   */
  getLocalIp() {
    try {
      const interfaces = os.networkInterfaces();
      for (const ifaceName in interfaces) {
        const iface = interfaces[ifaceName];
        if (!iface) continue;
        for (const alias of iface) {
          if (!alias.internal && alias.family === 'IPv4') {
            return alias.address;
          }
        }
      }
      throw new Error('没有找到可用的IP');
    } catch (error) {
      console.error('无法自动搜索本地IP：', error);
      return null;
    }
  }
}

module.exports = { ConfigManager };
