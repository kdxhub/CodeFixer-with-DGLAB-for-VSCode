const vscode = require("vscode");
const conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab");
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
  /**
   * @returns {boolean}
   */
  inrevertable: function () { return conf.get("code.inrevertable") },
}
const terminal = {
  /**
   * @returns {String} 工作模式
   */
  mode: function () { return conf.get("terminal.side") },
  /**
   * @returns {boolean}
   */
  inrevertable: function () { return conf.get("terminal.side") },
  /**
   * @returns {number}
   */
  rate: function () { return conf.get("terminal.rate") },
  /**
   * @returns {number}
   */
  duration: function () { return conf.get("terminal.duration") },
}
const server = {
  /**
   * @returns {Number}
   */
  port: function () { return conf.get("server.port") },
}

module.exports = {
  code: code,
  terminal: terminal,
  server: server,
}