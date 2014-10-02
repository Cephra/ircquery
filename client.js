var util = require("util");
var net = require("net");
var events = require("events");
var ircutil = require("./ircutil");
var list = require("./lists");

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
        for (key in defs) {
            if (opts[key] != undefined) {
                defs[key] = opts[key];
            }
        }
    }

    // getter & setter
    Object.defineProperties(this, {
        nick: {
            get: function () {
                return this._opts.nick;
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
                return this._opts.server;
            },
        },
    });

    // debug flag
    this.dbg = false;

    // member
    this._caps = {};

    // buffer for the worker
    var handleSend = {
        buf: [],
        delay: 0,
        send: function (data) {
            that.log("--> "+data);
            that.socket.write(data+"\r\n");
        },
    }
    this.cmd = function (data, dobuf) {
        // buffering flag set?
        if (dobuf) {
            handleSend.buf.push(data);
            if (handleSend.delay === 0) {
                workerSend(handleSend);
            }
            return that;
        } else {
            // don't buffer...
            handleSend.send(data);
            return that;
        }
    };

    // channel list
    this.channels = Object.create(list.Channels);
    
    // handlers 
    this.on("raw", function (res) {
        that.log("<-- "+res.line);
        if (ircutil.handlers[res.type])
            ircutil.handlers[res.type].call(that, res);
    });

    // received pong, send ping
    var timeout;
    this.on("pong", function(args) {
        // kill timeout if set
        if (timeout) clearTimeout(timeout);

        // ping again after 5s
        setTimeout(function () {
            that.cmd("PING :"+that.server);
        }, 5000);

        // if no ping received within 
        // 10s drop connection
        timeout = setTimeout(function () {
            // just exit
            // TODO reconnect automatically
            process.exit();
        }, 10000);
    });
};
util.inherits(Client, events.EventEmitter);

// shorthand
var proto = Client.prototype;

// logging functions
proto.log = function (arg) {
    if (this.dbg) {
        var date = new Date();
        console.log("["+
                date.toDateString()+" "+
                date.toLocaleTimeString()+"]");
        console.log(arg);
    }
}

proto.say = function (target, msg) {
    if (typeof msg === "undefined")
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
    this
        .cmd("JOIN "+chan)
        .channels.add(chan, this);
    this.channels[chan].rejoin =
        (typeof rejoin === "undefined") ?
        true : rejoin;

    return this;
};
proto.part = function (chan, msg) {
    msg = (msg) ? " :"+msg : "";
    this.cmd("PART "+chan+msg);

    return this;
};
// connect
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

    // event handler for "connect" and "data"
    sock.on("connect", function () {
        // logging in
        var pass = opts.pass;
        if (pass.length > 0)
            that.cmd("PASS "+pass);
        that.cmd("NICK "+opts.nick);
        that.cmd("USER "+
                opts.user+" 0 * :"+opts.desc);
    });
    // line buffering on data receive
    var buff = "";
    sock.on("data", function (chunk) {
        buff += chunk;
    
        var lines = buff.split("\r\n");
        buff = lines.pop();

        lines.forEach(function (line) {
            var res = ircutil.res(line);
            that.emit("raw", res);
        });
    });
};
module.exports = Client;
