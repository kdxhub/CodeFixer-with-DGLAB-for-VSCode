const vscode = require('vscode');
const ui = require('./vsc-ui.js');
const conf = require('./config.js');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  // 注册UI
  ui.onEnable(context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
