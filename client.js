var util = require("util");
var net = require("net");
var events = require("events");
var parse = require("./parse");

// default configuration
var defaults = {
    host: "chat.freenode.net",
    port: 6667,
    nick: "defnick",
    user: "defuser",
    desc: "defdesc",
};

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

    // member
    this._opts = opts;
    this._sock = new net.Socket();
    
    // parser
    this.on("raw", function (res) {
        console.log("try parse: "+res.type);
        if (parse[res.type])
            parse[res.type].call(this, res);
    });
};
util.inherits(Client, events.EventEmitter);

// proto functions
var prot = Client.prototype;
prot.log = function (text) {
    this.emit("log", text);
}
prot.cmd = function (cmd) {
    this.log("cmd: "+cmd);
    this._sock.write(cmd+"\r\n");
};
prot.connect = function () {
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
        that.cmd("USER "+opts.user+" 0 * :"+opts.desc);

        // emit login event
        that.emit("login");
    });
    var buff = "";
    sock.on("data", function (chunk) {
        // line buffering 
        buff += chunk;
    
        var lines = buff.split("\r\n");
        buff = lines.pop();

        lines.forEach(function (elem) {
            var res = parse.res(elem);
            that.emit("raw", res);
        });
    });
};
prot.join = function (chan) {
    this.cmd("JOIN "+chan);
};
prot.part = function (chan) {
    this.cmd("PART "+chan);
};
prot.say = function (target, text) {
    if (typeof text !== "undefined") {
        this.cmd("PRIVMSG "+target+" :"+text);
    }
};
module.exports = Client;
