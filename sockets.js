"use strict";

const SOCKET_IO = require('socket.io');
const UUID      = require('node-uuid');
const CRYPTO    = require('crypto');

module.exports = function (server, config) {
    let io = SOCKET_IO.listen(server);

    io.sockets.on('connection', (client) => {
        client.resources = {
            screen: false,
            video: true,
            audio: false,
        };

        console.log("SIGNALS::connection => ", client);

        // pass a message to another id
        client.on('message', (details) => {
            if (! details ) {
                return
            };
            let otherClient = io.to(details.to);
            if (! otherClient ) {
                return
            };
            details.from = client.id;
            console.log("SIGNALS::message", details);
            otherClient.emit('message', details);
          });

        client.on('shareScreen', () => {
            client.resources.screen = true;
            console.log("SIGNALS::shareScreen", client);
          });

        client.on('unshareScreen', (type) => {
            client.resources.screen = false;
            console.log("SIGNALS::unshareScreen", client);
            removeFeed('screen');
          });

        client.on('join', join);

        let removeFeed = (type) => {
            console.log("SIGNALS::removeFeed", type);
          if (client.room) {
              io.sockets.in(client.room).emit('remove', {
                  id: client.id,
                  type: type,
              });
              if (!type) {
                  client.leave(client.room);
                  client.room = undefined;
              }
          }
        }

        let join = (name, cb) => {
          // sanity check
          if (typeof name !== 'string') return;

          console.log("SIGNALS::join", name);

          // check if maximum number of clients reached
          if (config.rooms && config.rooms.maxClients > 0 &&
              clientsInRoom(name) >= config.rooms.maxClients) {
              safeCb(cb)('full');
              return;
          }
          // leave any existing rooms
          removeFeed();
          safeCb(cb)(null, describeRoom(name));
          client.join(name);
          client.room = name;
        }

        // we don't want to pass "leave" directly because the
        // event type string of "socket end" gets passed too.
        client.on('disconnect', () => {
            console.log("SIGNALS::disconnect");
            removeFeed();
        });
        client.on('leave', () => {
            console.log("SIGNALS::leave");
            removeFeed();
        });

        client.on('create', function (name, cb) {
            console.log("SIGNALS::create => ", name);
            if (arguments.length == 2) {
              cb = (typeof cb == 'function') ? cb : function () {};

              name = name || UUID();
            } else {
              cb = name;
              name = UUID();
            }
            // check if exists
            var room = io.nsps['/'].adapter.rooms[name];
            if (room && room.length) {
              safeCb(cb)('taken');
            } else {
              join(name);
              safeCb(cb)(null, name);
            }
          });

        // support for logging full webrtc traces to stdout
        // useful for large-scale error monitoring
        client.on('trace', function (data) {
            console.log('trace', JSON.stringify(
            [data.type, data.session, data.prefix, data.peer, data.time, data.value]
            ));
          });


        // tell client about stun and turn servers and generate nonces
        console.log("SIGNALS::STUN_SERVERS => ", config.stunservers);
        client.emit('stunservers', config.stunservers || []);

        let credentials = [];

            // create shared secret nonces for TURN authentication
            // the process is described in draft-uberti-behave-turn-rest

            // allow selectively vending turn credentials based on origin.
            let origin = client.handshake.headers.origin;

            if (!config.turnorigins || config.turnorigins.indexOf(origin) !== -1) {
              config.turnservers.forEach((server) => {
                    if (config.sharedKeyAuth) {
                        let hmac = CRYPTO.createHmac('sha1', server.secret);
                        // default to 86400 seconds timeout unless specified
                        let username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + '';
                        hmac.update(username);
                        credentials.push({
                            username: username,
                            credential: hmac.digest('base64'),
                            urls: server.urls || server.url,
                        });
                    } else {
                        credentials.push({
                            username: username,
                            credential: server.secret,
                            urls: server.urls || server.url,
                        });
                    }
              });
            }

        client.emit('turnservers', credentials);
    });

    let describeRoom = (name) => {
        let adapter = io.nsps['/'].adapter;
        let clients = adapter.rooms[name] || {};
        let result = {
            clients: {}
        };
        Object.keys(clients).forEach(function (id) {
            result.clients[id] = adapter.nsp.connected[id].resources;
        });

        return result;
    }

    let clientsInRoom = () => {
        let clientsCount = 0;
        for (let socketId in io.nsps['/'].adapter.rooms[name] || {}) {
            clientsCount++;
        }
        return clientsCount;
    };

};

let safeCb = (cb) => {
    return typeof cb === 'function' ? cb : () => {};
}
