var util = require("util");
var net = require("net");
var events = require("events");
var ircutil = require("./ircutil");
var list = require("./lists");

// buffer worker TODO: make this more pretty
var workerSend = function (that) {
    var cmdbuf = that._cmdbuf;
    if (cmdbuf.length > 0) {
        var sock = that._sock;
        var cmd = that._cmdbuf.shift();
        that._cmd(cmd); // send cmd

        that._delay = (that._delay < 1000) ?
            that._delay+250 : that._delay;

        setTimeout(workerSend, that._delay, that);
    } else { that._delay = 0; }
}

// client constructor
var Client = function (opts) {
    events.EventEmitter.call(this);

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

    // debug flag
    this.dbg = false;

    // member
    this._cmdbuf = [];
    this._delay = 0;
    this._caps = {};

    // channel list
    this.channels = Object.create(list.Channels);
    
    // handlers 
    this.on("raw", function (res) {
        this.log(res.line);
        if (ircutil.handlers[res.type])
            ircutil.handlers[res.type].call(this, res);
    });

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
};
util.inherits(Client, events.EventEmitter);

// shorthand
var proto = Client.prototype;

// logging functions
proto.log = function (arg) {
    if (this.dbg)
        console.log(arg);
}
proto.dir = function (arg) {
    if (this.dbg)
        console.dir(arg);
}

// irc functions
proto._cmd = function (cmd) {
    this.log("cmd: "+cmd);
    this._sock.write(cmd+"\r\n");
}
proto.cmd = function (cmd, dobuf) {
    // buffering flag set?
    if (dobuf) {
        this._cmdbuf.push(cmd);
        if (this._delay === 0) {
            workerSend(this);
        }
        return this;
    } else {
        // don't buffer...
        this._cmd(cmd);
        return this;
    }
};
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
    // send part to server
    msg = (msg) ? " :"+msg : "";
    this.cmd("PART "+chan+msg);

    return this;
};
// connect
proto.connect = function () {
    var that = this;
    var sock = that._sock =
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
        var pass = that._opts.pass;
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
