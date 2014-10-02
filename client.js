var util = require("util");
var net = require("net");
var events = require("events");
var ircutil = require("./ircutil");
var list = require("./lists");

// handler the send buffer
var workerSend = function (args) {
    var buf = args.buf;
    if (buf.length > 0) {
        var cmd = buf.shift();
        args.send(cmd);

        args.delay = (args.delay < 1000) ?
            args.delay+250 : args.delay;

        setTimeout(workerSend, args.delay, args);
    } else { args.delay = 0; }
}

// client constructor
var Client = function (opts) {
    events.EventEmitter.call(this);

    // this to that
    var that = this;

    // configuration
    var defs = this._opts = {
        host: "chat.freenode.net",
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
    });

    // debug flag
    this.dbg = false;

    // member
    this._caps = {};

    // buffer for the worker
    var bufSend = {
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
            bufSend.buf.push(data);
            if (bufSend.delay === 0) {
                workerSend(bufSend);
            }
            return that;
        } else {
            // don't buffer...
            bufSend.send(data);
            return that;
        }
    };

    // channel list
    this.channels = Object.create(list.Channels);
    
    // handlers 
    this.on("raw", function (res) {
        this.log("<-- "+res.line);
        if (ircutil.handlers[res.type])
            ircutil.handlers[res.type].call(this, res);
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
            opts.host);

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
