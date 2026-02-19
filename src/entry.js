const vscode = require('vscode');
const dglab = require('./dglab-server.js');
const ui = require('./vsc-ui.js');

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
