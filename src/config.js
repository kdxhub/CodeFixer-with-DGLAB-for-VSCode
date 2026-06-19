const vscode = require("vscode");
const pulseHelper = require('./dglab-server/getpluse.js');
const os = require('os');

let conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab");
function onChangedConfig() { conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab"); };

function getConf() {
  return vscode.workspace.getConfiguration("codefixer-with-dg-lab");
}

const code = {
  info: {
    /**
     * @returns {Number|undefined}
     */
    first: function () { return getConf().get("code.infoFirst") },
    /**
     * @returns {Number|undefined}
     */
    every: function () { return getConf().get("code.infoEvery") },
    /**
     * @returns {Number|undefined}
     */
    max: function () { return getConf().get("code.infoMax") },
  },
  warn: {
    /**
     * @returns {Number|undefined}
     */
    first: function () { return getConf().get("code.warnFirst") },
    /**
     * @returns {Number|undefined}
     */
    every: function () { return getConf().get("code.warnEvery") },
    /**
     * @returns {Number|undefined}
     */
    max: function () { return getConf().get("code.warnMax") },
  },
  error: {
    /**
     * @returns {Number|undefined}
     */
    first: function () { return getConf().get("code.errorFirst") },
    /**
     * @returns {Number|undefined}
     */
    every: function () { return getConf().get("code.errorEvery") },
    /**
     * @returns {Number|undefined}
     */
    max: function () { return getConf().get("code.errorMax") },
  },
  /**
   * @returns {String|undefined} 工作模式
   */
  mode: function () { return getConf().get("code.side") },
}
const terminal = {
  /**
   * @returns {String|undefined} 工作模式
   */
  mode: function () { return getConf().get("terminal.side") },
  /**
   * @returns {boolean|undefined}
   */
  inrevertable: function () { return conf.get("terminal.inrevertable") },
  /**
   * @returns {number|undefined}
   */
  rate: function () { return getConf().get("terminal.rate") },
  /**
   * @returns {number|undefined}
   */
  duration: function () { return getConf().get("terminal.duration") },
  /**
   * @returns {number|undefined}
   */
  interrupt: function () { return getConf().get("terminal.interruptSeeAs") },
  /**
   * @returns {String|undefined}
   */
  tips: function () { return getConf().get("terminal.tips") },
}
const server = {
  /**
   * @returns {Number|undefined}
   */
  port: function () { return getConf().get("server.port") },
  /**
   * @returns {String|undefined}
   */
  ip: function () { return getConf().get("server.override_ip") },
  qrcode: {
    /**
     * @returns {Number|undefined}
     */
    size: function () { return getConf().get("server.qrcode.size") },
    /**
     * @returns {String|undefined}
     */
    correctlevel: function () { return getConf().get("server.qrcode.correctionLevel") },
  }
}
const pulse = {
  left: {
    get: function () { return getConf().get("pulse.left"); },
    getData: function () { return pulseHelper.get(pulse.left.get()); },
  },
  right: {
    get: function () { return getConf().get("pulse.right") },
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
      // @ts-ignore
      for (let i = 0; i < iface.length; i++) {
        // @ts-ignore
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