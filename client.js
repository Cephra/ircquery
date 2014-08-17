var util = require("util");
var net = require("net");
var events = require("events");
var parse = require("./parse");
var channels = require("./channels.js");

// default configuration
var defaults = {
    host: "chat.freenode.net",
    port: 6667,
    nick: "defnick",
    user: "defuser",
    desc: "defdesc",
};

// buffer worker
var bufcb = function (that) {
    var cmdbuf = that._cmdbuf;
    if (cmdbuf.length >= 1) {
        var sock = that._sock;
        var cmd = that._cmdbuf.shift();
        sock.write(cmd+"\r\n");

        that._delay += 5;
        setTimeout(bufcb, that._delay, that);
    } else { 
        that._sending = false;
        that._delay = 0;
    }
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
    this._delay = 0; // send delay

    // channel list
    this.channels = Object.create(channels);
    
    // parser
    this.on("raw", function (res) {
        this.log(res.line);
        if (parse[res.type])
            parse[res.type].call(this, res);
    });
};
util.inherits(Client, events.EventEmitter);

// shorthand
var proto = Client.prototype;
// logging
proto.log = function (arg) {
    if (this.dbg)
        console.log(arg);
}
proto.dir = function (arg) {
    if (this.dbg)
        console.dir(arg);
}
// irc functions
proto.cmd = function (cmd) {
    this.log("cmd: "+cmd);
    this._cmdbuf.push(cmd);
    if (!this._sending) {
        this._sending = true;
        bufcb(this);
    }
    return this;
};
proto.join = function (chan, rejoin) {
    this
        .cmd("JOIN "+chan)
        .cmd("MODE "+chan)
        .cmd("MODE "+chan+" +q")
        .cmd("MODE "+chan+" +b")
        .once("jointo"+chan, function () {
            this.channels[chan].rejoin = rejoin;
        });
    return this;
};
proto.part = function (chan, msg) {
    // send part to server
    msg = (msg) ? ": "+msg : "";
    this.cmd("PART "+chan+msg);

    return this;
};
proto.say = function (target, text) {
    if (typeof text !== "undefined") {
        this.cmd("PRIVMSG "+target+" :"+text);
    }
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
        that.cmd("NICK "+opts.nick);
        that.cmd("USER "+
                opts.user+" 0 * :"+opts.desc);
        that.cmd("CAP REQ :multi-prefix");
        that.cmd("PROTOCTL NAMESX");

        // emit login event
        that.emit("login");
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
};
module.exports = Client;
