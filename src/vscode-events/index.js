const vscode = require('vscode');

/**
 * VSCode 事件处理器
 * 监听 VSCode 诊断变化和终端执行事件，
 * 通过 PowerManager 的事件 API 管理强度贡献。
 *
 * 诊断 → 长期事件（persistent）：每次重新计算后 updateEvent 修改值
 * 终端 → 临时事件（temporary）：每次执行创建独立事件，duration 后自动过期
 */
class VscodeEventHandler {
  /**
   * @param {import('../pulse-service/index.js').PowerManager} powerManager
   * @param {import('../config-manager/index.js').ConfigManager} configManager
   */
  constructor(powerManager, configManager) {
    this._pm = powerManager;
    this._config = configManager;
    /** @type {function} UI 更新回调 */
    this._onUpdate = null;

    /** 诊断事件是否已初始化 */
    this._diagnosticsInited = false;
  }

  /**
   * 注册 UI 更新回调
   * @param {() => void} cb
   */
  onUpdate(cb) { this._onUpdate = cb; }

  _notifyUpdate() { if (this._onUpdate) this._onUpdate(); }

  // ── 诊断事件处理 ──

  /**
   * 处理诊断变化
   * 创建/更新长期强度事件
   */
  processDiagnostics() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      // 无编辑器时归零代码事件
      if (this._pm.hasEvent('_code_left')) this._pm.updateEvent('_code_left', 0);
      if (this._pm.hasEvent('_code_right')) this._pm.updateEvent('_code_right', 0);
      console.log('诊断强度归零（无编辑器）');
      this._notifyUpdate();
      return;
    }

    // 统计诊断数量
    let errors = 0, warnings = 0, infos = 0;
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    for (const d of diagnostics) {
      switch (d.severity) {
        case vscode.DiagnosticSeverity.Error:
          if (errors < this._config.codeError.max) errors++;
          break;
        case vscode.DiagnosticSeverity.Warning:
          if (warnings < this._config.codeWarn.max) warnings++;
          break;
        case vscode.DiagnosticSeverity.Information:
        case vscode.DiagnosticSeverity.Hint:
          if (infos < this._config.codeInfo.max) infos++;
          break;
      }
    }

    // 计算强度
    let strength = 0;
    if (errors >= 1) {
      strength += this._config.codeError.first;
      strength += this._config.codeError.every * (errors - 1);
    }
    if (warnings >= 1) {
      strength += this._config.codeWarn.first;
      strength += this._config.codeWarn.every * (warnings - 1);
    }
    if (infos >= 1) {
      strength += this._config.codeInfo.first;
      strength += this._config.codeInfo.every * (infos - 1);
    }

    // 根据模式分配左右通道，写入长期事件
    const mode = this._config.codeMode;
    const leftVal = this._calcChannelValue(mode, strength);
    const rightVal = this._calcChannelValueReverse(mode, strength);

    console.log('诊断强度计算:', { strength, mode, leftVal, rightVal });

    if (leftVal !== undefined) {
      if (this._pm.hasEvent('_code_left')) {
        this._pm.updateEvent('_code_left', leftVal);
      } else {
        this._pm.addEvent({
          id: '_code_left', channel: 'left', value: leftVal,
          category: 'persistent', label: '代码纠错',
        });
      }
    }

    if (rightVal !== undefined) {
      if (this._pm.hasEvent('_code_right')) {
        this._pm.updateEvent('_code_right', rightVal);
      } else {
        this._pm.addEvent({
          id: '_code_right', channel: 'right', value: rightVal,
          category: 'persistent', label: '代码纠错',
        });
      }
    }

    console.log('当前所有强度事件:', this._pm.getAllEvents());
    this._notifyUpdate();
  }

  /**
   * 根据模式计算单侧强度值
   * @param {string} mode
   * @param {number} total
   * @returns {number|undefined}
   */
  _calcChannelValue(mode, total) {
    switch (mode) {
      case 'left': return total;
      case 'right': return 0;
      case 'bothAvg': return Math.floor(total / 2);
      case 'bothAll': return total;
      default: return Math.random() <= 0.5 ? total : 0;
    }
  }

  _calcChannelValueReverse(mode, total) {
    switch (mode) {
      case 'left': return 0;
      case 'right': return total;
      case 'bothAvg': return Math.floor(total / 2);
      case 'bothAll': return total;
      default: return Math.random() <= 0.5 ? 0 : total;
    }
  }

  // ── 终端事件处理 ──

  /**
   * 处理终端执行事件
   * 每次执行创建一个独立的临时强度事件，duration 后自动过期
   * @param {import('vscode').TerminalShellExecutionEvent} event
   */
  processTerminalExecution(event) {
    let exitCode = event.exitCode;
    if (exitCode === undefined) {
      exitCode = this._config.terminalInterrupt;
    }

    const rate = this._config.terminalRate;
    const duration = this._config.terminalDuration;

    if (exitCode <= 0 || rate <= 0 || duration <= 0) return;

    const strength = exitCode * rate;
    console.log('终端执行：exitCode=%d, rate=%d, strength=%d, duration=%dms',
      exitCode, rate, strength, duration);

    // 为左右各创建一个临时事件（唯一 ID）
    const mode = this._config.codeMode;
    const leftVal = this._calcChannelValue(mode, strength);
    const rightVal = this._calcChannelValueReverse(mode, strength);

    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);

    if (leftVal > 0) {
      this._pm.addEvent({
        id: `_term_left_${timestamp}_${rand}`,
        channel: 'left',
        value: leftVal,
        category: 'temporary',
        label: '终端退出码',
        duration,
      });
    }

    if (rightVal > 0) {
      this._pm.addEvent({
        id: `_term_right_${timestamp}_${rand}`,
        channel: 'right',
        value: rightVal,
        category: 'temporary',
        label: '终端退出码',
        duration,
      });
    }

    console.log('终端强度事件已添加，当前所有事件:', this._pm.getAllEvents());
    this._notifyUpdate();

    // 显示提示
    const tips = this._config.terminalTips;
    if (tips && tips.length > 0) {
      vscode.window.showInformationMessage(
        tips
          .replace(/%duration%/g, duration.toString())
          .replace(/%strength%/g, strength.toString())
      );
    }
  }

  // ── 注册 VSCode 监听器 ──

  /**
   * 在 VSCode 上下文中注册所有事件监听
   * @param {vscode.ExtensionContext} context
   */
  registerListeners(context) {
    context.subscriptions.push(
      vscode.languages.onDidChangeDiagnostics(() => this.processDiagnostics())
    );
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.processDiagnostics())
    );

    this._ensureShellIntegration();
    context.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution((e) => this.processTerminalExecution(e))
    );
  }

  async _ensureShellIntegration() {
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    const enabled = config.get('shellIntegration.enabled');

    if (!enabled) {
      const answer = await vscode.window.showInformationMessage(
        '需要启用终端 Shell 集成才能处理终端命令执行结果，是否现在开启？',
        '开启',
        '暂不'
      );
      if (answer === '开启') {
        await config.update('shellIntegration.enabled', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Shell 集成已启用，请重启终端');
      }
    }
  }
}

module.exports = { VscodeEventHandler };
