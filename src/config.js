const vscode = require("vscode");
const pulseHelper = require('./dglab-server/getpluse.js');
const os = require('os');

let conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab");
function onChangedConfig() { conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab"); };

const code = {
  info: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("code.infoFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("code.infoEvery") },
  },
  warn: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("code.warnFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("code.warnEvery") },
  },
  error: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("code.errorFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("code.errorEvery") },
  },
  /**
   * @returns {String} 工作模式
   */
  mode: function () { return conf.get("code.side") },
}
const terminal = {
  /**
   * @returns {String} 工作模式
   */
  mode: function () { return conf.get("terminal.side") },
  /**
   * @returns {boolean}
   */
  inrevertable: function () { return conf.get("terminal.inrevertable") },
  /**
   * @returns {number}
   */
  rate: function () { return conf.get("terminal.rate") },
  /**
   * @returns {number}
   */
  duration: function () { return conf.get("terminal.duration") },
  /**
   * @returns {number}
   */
  interrupt: function () { return conf.get("terminal.interruptSeeAs") },
  /**
   * @returns {String}
   */
  tips: function () { return conf.get("terminal.tips") },
}
const server = {
  /**
   * @returns {Number}
   */
  port: function () { return conf.get("server.port") },
  /**
   * @returns {String}
   */
  ip: function () { return conf.get("server.override_ip") },
  qrcode: {
    /**
     * @returns {Number}
     */
    size: function () { return conf.get("server.qrcode.size") },
    /**
     * @returns {String}
     */
    correctlevel: function () { return conf.get("server.qrcode.correctionLevel") },
  }
}
const pulse = {
  left: {
    get: function () { return conf.get("pulse.left"); },
    getData: function () { return pulseHelper.get(pulse.left.get()); },
  },
  right: {
    get: function () { return conf.get("pulse.right") },
    getData: function () { return pulseHelper.get(pulse.right.get()); },
  }
}

/**
 * 寻找一个有效的本地IP地址
 * @returns {String|null}
 */
function getLocalIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
      const iface = interfaces[interfaceName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (/* alias.family === 'IPv4' &&  */!alias.internal) {
          return alias.address;
        };
      };
    };
    throw new Error("没有找到可用的IP");
  } catch (error) {
    console.error("无法自动搜索本地IP：", error);
    return null;  // 没找到返回 null
  };
};


module.exports = {
  code: code,
  terminal: terminal,
  server: server,
  pulse: pulse,
  getLocalIp,
  onChangedConfig,
}