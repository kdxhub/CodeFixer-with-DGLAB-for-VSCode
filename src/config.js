const vscode = require("vscode");
const conf = vscode.workspace.getConfiguration("codefixer-with-dg-lab");
const strength = {
  info: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("add.infoFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("add.infoEvery") },
  },
  warn: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("add.warnFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("add.warnEvery") },
  },
  error: {
    /**
     * @returns {Number}
     */
    first: function () { return conf.get("add.errorFirst") },
    /**
     * @returns {Number}
     */
    every: function () { return conf.get("add.errorEvery") },
  },
  /**
   * @returns {String} 工作模式
   */
  mode: function () { return conf.get("side") },
}
const server = {
  port: function () { return conf.get("server.port") },
}

module.exports = {
  strength: strength,
  server: server,
}