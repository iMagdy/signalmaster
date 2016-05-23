"use strict";
const config       = require('getconfig');
const fs           = require('fs');
const sockets      = require('./sockets');
const port         = parseInt(process.env.PORT || config.server.port, 10);

let server_handler = (req, res) => { res.writeHead(404); res.end(); };
let server         = null;

// Create an http(s) server instance to that socket.io can listen to
if (config.server.secure) {
    server = require('https').Server({
        key: fs.readFileSync(config.server.key),
        cert: fs.readFileSync(config.server.cert),
        passphrase: config.server.password
    }, server_handler);
} else {
    server = require('http').Server(server_handler);
}

server.listen(port);

sockets(server, config);

if (config.uid) process.setuid(config.uid);

var httpUrl;
if (config.server.secure) {
    httpUrl = "https://localhost:" + port;
} else {
    httpUrl = "http://localhost:" + port;
}
console.log(' Signalling server running on: ' + httpUrl);
