"use strict";

var util = require("util");
var net = require("net");
var events = require("events");
var parsers = require("./parsers");

// handler the send buffer
var workerSend = function (handle) {
    var buf = handle.buf;
    if (buf.length > 0) {
        var cmd = buf.shift();
        handle.send(cmd);

        handle.delay = (handle.delay < 1000) ?
            handle.delay+250 : handle.delay;

        setTimeout(workerSend, handle.delay, handle);
    } else { handle.delay = 0; }
}

// client constructor
var Client = function (opts) {
    events.EventEmitter.call(this);

    // this to that
    var that = this;

    // configuration
    var defs = this._opts = {
        server: "chat.freenode.net",
        port: 6667,
        pass: "",
        nick: "defnick",
        user: "defuser",
        desc: "defdesc",
    };
    if (typeof opts === "object") {
        for (var key in defs) {
            if (opts[key] != undefined) {
                defs[key] = opts[key];
            }
        }
    }

    // getter & setter
    Object.defineProperties(that, {
        nick: {
            get: function () {
                return that._opts.nick;
            },
            set: function (v) {
                // nick is automatically changed
                // when the server response is
                // received
                // this._opts.nick = v;
                this.cmd("NICK "+v);
            },
        },
        server: {
            get: function () {
                return that._opts.server;
            },
        },
    });

    // debug flag
    this.dbg = false;

    // server supports
    this.supports = {};

    // buffer for the worker
    var handlerSend = {
        buf: [],
        delay: 0,
        send: function (data) {
            that.log("--> "+data);
            that.socket.write(data+"\r\n");
        },
    };
    this.cmd = function (data, dobuf) {
        if (dobuf) {
            // buffering
            handlerSend.buf.push(data);
            if (handlerSend.delay === 0) {
                workerSend(handlerSend);
            }
            return that;
        } else {
            // don't buffer...
            handlerSend.send(data);
            return that;
        }
    };

    // handlers 
    this.on("raw", function (res) {
        that.log("<-- "+res.line);
        if (parsers.response[res.type]) {
            parsers.response[res.type].call(that, res);
        }
    });

    // received pong, send ping
    var timeout;
    this.on("pong", function(args) {

        // kill timeout if set
        if (timeout) { clearTimeout(timeout) };

        // ping every minute
        // timeout after 5 seconds
        setTimeout(function () {
            that.cmd("PING :"+that.server);

            timeout = setTimeout(function () {
                // TODO make the client reconnect
                process.exit();
            }, 5000);
        }, 60000);
    });
};
util.inherits(Client, events.EventEmitter);

var proto = Client.prototype;
proto.log = function (arg) {
    if (this.dbg) {
        var date = new Date();
        console.log("["+
                date.toDateString()+" "+
                date.toLocaleTimeString()+"] "+arg);
    }
}

proto.say = function (target, msg) {
    if (msg === undefined)
        return this;
    msg.toString().split(/\r?\n/)
        .filter(function (v) {
            return v.length > 0;
        })
        .forEach(function (v) {
            this.cmd("PRIVMSG "+target+" :"+v, true);
        }, this);
    return this;
};
proto.join = function (chan, rejoin) {
    this.cmd("JOIN "+chan);
    this.emit("joining", chan);

    return this;
};
proto.part = function (chan, msg) {
    if (this.channel(chan)) {
        msg = (msg) ? " :"+msg : "";
        this.cmd("PART "+chan+msg);
    }
    return this;
};
proto.connect = function () {
    var that = this;
    var sock = that.socket =
        new net.Socket();
    var opts = that._opts;

    // setup socket
    sock.setEncoding("utf8");
    sock.setTimeout(0);

    // init connection
    that.log("connecting...");
    sock.connect(
            opts.port, 
            opts.server);

    // event handler for "connect"
    sock.on("connect", function () {
        // logging in
        var pass = opts.pass;
        if (pass.length > 0)
            that.cmd("PASS "+pass);

        that.cmd("NICK "+opts.nick);

        that.cmd("USER "+opts.user+
                " 0 * :"+opts.desc);
    });

    // line buffering on data receive
    var buff = "";
    sock.on("data", function (chunk) {
        buff += chunk;
    
        var lines = buff.split("\r\n");
        buff = lines.pop();

        lines.forEach(function (line) {
            var res = parsers.split(line);
            that.emit("raw", res);
        });
    });
};
module.exports = Client;
