const vscode = require('vscode');
const dglab = require('./dglab-server.js');
const main = require('./entry.js');

const power = {
  left: {
    set: function (value) { },
    get: function () { },
  },
  right: {
    set: function (value) { },
    get: function () { },
  },
}

function startServer() { }

function stopServer() { }

module.exports = {
  power: power,
  startServer: startServer,
  stopServer: stopServer
}