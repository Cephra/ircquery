var util = require("util");
var net = require("net");
var events = require("events");
var parse = require("./parse");
var list = require("./list.js");

// default configuration
var defaults = {
    host: "chat.freenode.net",
    port: 6667,
    pass: "",
    nick: "defnick",
    user: "defuser",
    desc: "defdesc",
};

// buffer worker
var bufcb = function (that) {
    var cmdbuf = that._cmdbuf;
    if (cmdbuf.length > 0) {
        var sock = that._sock;
        var cmd = that._cmdbuf.shift();
        that.log("cmd: "+cmd);
        sock.write(cmd+"\r\n");

        that._delay = (that._delay < 1000) ?
            that._delay+250 : that._delay;

        setTimeout(bufcb, that._delay, that);
    } else { that._delay = 0; }
}

// client constructor
var Client = function (opts) {
    events.EventEmitter.call(this);

    // validate options
    if (typeof opts !== "object") {
        opts = defaults;
    } else {
        opts.host = (typeof opts.host !== "string" ?
                defaults : opts).host;
        opts.port = (typeof opts.port !== "number" ?
                defaults : opts).port;
        opts.pass = (typeof opts.pass !== "string" ?
                defaults : opts).pass;

        opts.nick = (typeof opts.nick !== "string" ?
                defaults : opts).nick;
        opts.user = (typeof opts.user !== "string" ?
                defaults : opts).user;
        opts.desc = (typeof opts.desc !== "string" ?
                defaults : opts).desc;
    }

    // debug flag
    this.dbg = false;

    // member
    this._opts = opts;
    this._sock = new net.Socket();
    this._cmdbuf = [];
    this._delay = 0;
    this._caps = {};

    // channel list
    this.channels = Object.create(list.Channels);
    
    // parser
    this.on("raw", function (res) {
        this.log(res.line);
        if (parse[res.type])
            parse[res.type].call(this, res);
    });

    // getter/setter
    Object.defineProperties(this, {
        // change name back on error
        nick: {
            get: function () {
                return this._opts.nick;
            },
            set: function (v) {
                this._opts.nick = v;
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
proto.cmd = function (cmd, nobuf) {
    // no buffering?
    if (nobuf) {
        this._cmd(cmd);
        return this;
    }
    this._cmdbuf.push(cmd);
    if (this._delay === 0) {
        bufcb(this);
    }
    return this;
};
proto.say = function (target, msg) {
    if (typeof msg === "undefined")
        return this;
    msg.toString().split(/\r?\n/)
        .filter(function (v) {
            return v.length > 0;
        })
        .forEach(function (v) {
            this.cmd("PRIVMSG "+target+" :"+v);
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
    var sock = that._sock;
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
            that.cmd("PASS "+pass, true);
        that.cmd("NICK "+opts.nick, true);
        that.cmd("USER "+
                opts.user+" 0 * :"+opts.desc,
                true);
    });
    var buff = "";
    sock.on("data", function (chunk) {
        // line buffering 
        buff += chunk;
    
        var lines = buff.split("\r\n");
        buff = lines.pop();

        lines.forEach(function (line) {
            var res = parse.res(line);
            that.emit("raw", res);
        });
    });
    sock.on("close", function() {
        // TODO make it reconnect
        process.exit();
    });
};
module.exports = Client;
