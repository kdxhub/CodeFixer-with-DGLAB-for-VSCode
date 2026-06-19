const vscode = require('vscode');

/**
 * VSCode 事件处理器
 * 负责监听 VSCode 的诊断变化和终端执行事件，
 * 计算强度后写入 PowerManager，并通过回调通知 UI 更新。
 * 依赖注入：PowerManager, ConfigManager
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
  }

  /**
   * 注册 UI 更新回调
   * @param {() => void} cb
   */
  onUpdate(cb) {
    this._onUpdate = cb;
  }

  /** 触发 UI 更新 */
  _notifyUpdate() {
    if (this._onUpdate) this._onUpdate();
  }

  // ── 强度分配工具 ──

  /**
   * 根据配置模式将强度分配到左右通道
   * @param {number} strength
   * @param {number} sourceIndex 来源索引 (0=代码纠错, 1=终端纠错)
   */
  _distributeStrength(strength, sourceIndex) {
    const mode = this._config.codeMode;
    switch (mode) {
      case 'left':
        this._pm.setRight(sourceIndex, 0);
        this._pm.setLeft(sourceIndex, strength);
        break;
      case 'right':
        this._pm.setRight(sourceIndex, strength);
        this._pm.setLeft(sourceIndex, 0);
        break;
      case 'bothAvg':
        this._pm.setRight(sourceIndex, Math.floor(strength / 2));
        this._pm.setLeft(sourceIndex, Math.floor(strength / 2));
        break;
      case 'bothAll':
        this._pm.setRight(sourceIndex, strength);
        this._pm.setLeft(sourceIndex, strength);
        break;
      default:
        // 随机一边
        if (Math.random() <= 0.5) {
          this._pm.setRight(sourceIndex, strength);
          this._pm.setLeft(sourceIndex, 0);
        } else {
          this._pm.setRight(sourceIndex, 0);
          this._pm.setLeft(sourceIndex, strength);
        }
        break;
    }
  }

  // ── 诊断事件处理 ──

  /**
   * 处理诊断变化事件
   */
  processDiagnostics() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._pm.setLeft(0, 0);
      this._pm.setRight(0, 0);
      console.log('上传纠错强度：0（无编辑器）');
      this._notifyUpdate();
      return;
    }

    // 分类统计
    let errors = 0;
    let warnings = 0;
    let infos = 0;

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

    console.log('上传纠错强度：', strength);
    this._distributeStrength(strength, 0); // 索引0 = 代码纠错
    console.log('更新强度：', this._pm.leftValues, this._pm.rightValues);
    this._notifyUpdate();
  }

  // ── 终端事件处理 ──

  /**
   * 处理终端执行事件
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
    console.log('上传终端强度：', strength);

    const originLeft = this._pm.leftValues[1];
    const originRight = this._pm.rightValues[1];
    const irreversible = this._config.terminalIrreversible;

    this._distributeStrength(strength, 1); // 索引1 = 终端纠错

    // 如果可逆，设定时器恢复
    if (irreversible) {
      setTimeout(() => {
        this._pm.setLeft(1, this._pm.leftValues[1] - strength);
        this._pm.setRight(1, this._pm.rightValues[1] - strength);
        console.log('恢复终端强度：', this._pm.leftValues, this._pm.rightValues);
        this._notifyUpdate();
      }, duration);
    }

    console.log('更新强度：', this._pm.leftValues, this._pm.rightValues);
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
    // 诊断变化
    context.subscriptions.push(
      vscode.languages.onDidChangeDiagnostics(() => {
        this.processDiagnostics();
      })
    );

    // 可见编辑器变化
    context.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.processDiagnostics();
      })
    );

    // 终端执行
    this._ensureShellIntegration();
    context.subscriptions.push(
      vscode.window.onDidEndTerminalShellExecution((e) => {
        this.processTerminalExecution(e);
      })
    );
  }

  /**
   * 确保终端 Shell 集成已启用
   */
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
