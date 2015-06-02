"use strict";

var util = require("util");
var net = require("net");
var tls = require("tls");
var events = require("events");
var handlers = require("./handlers");
var ircutil = require("./ircutil");
var query = require("./query");

// send buffer worker
var sendWorker = function (handle) {
  var buf = handle.buf;
  if (buf.length > 0) {
    var cmd = buf.shift();
    handle.send(cmd);

    handle.delay = (handle.delay < 1000) ?
      handle.delay+250 : handle.delay;

    setTimeout(sendWorker, handle.delay, handle);
  } else { handle.delay = 0; }
};

// client constructor
var Client = function (userconf) {
  // Inherit from Event Emitter
  // so we can throw Events
  events.EventEmitter.call(this);

  // this to that
  var that = this;

  // default configuration
  var conf = {
    host: "chat.freenode.net",
    port: 7000,
    pass: "",
    retry: true,
    ssl: true,
    nick: "defnick",
    user: "defuser",
    desc: "defdesc",
    dbg: false,
    dbglvl: 0,
  };
  // overwrite defaults
  if (typeof userconf === "object") {
    for (var key in conf) {
      if (userconf[key] !== undefined) {
        conf[key] = userconf[key];
      }
    }
  }
  conf.altnick = conf.nick+"_";
  //that.config = Object.freeze(conf);
  that.config = conf;

  that.qry = query.create.call(that);
  that.util = {};

  // getter & setter
  Object.defineProperties(that, {
    nick: {
      get: function () {
        return that.config.nick;
      },
      set: function (v) {
        that.cmd("NICK "+v);
      },
    },
  });

  // sendHandle for sendWorker
  var sendHandle = {
    buf: [],
    delay: 0,
    send: function (data) {
      that.log(2,"--> "+data);
      that.socket.write(data+"\r\n");
    },
  };
  that.cmd = function (data, dobuf) {
    if (dobuf) {
      // buffering
      sendHandle.buf.push(data);
      if (sendHandle.delay === 0) {
        sendWorker(sendHandle);
      }
    } else {
      // don't buffer...
      sendHandle.send(data);
    }
    return that;
  };

  // handlers
  that.on("raw", function (res) {
    that.log(2,"<-- "+res.line);
    if (handlers.response[res.type]) {
      handlers.response[res.type].call(that, res);
    }
  });

  // received pong, send ping
  var ping = {};
  that.on("disconnect", function () {
    if (ping.tmout) { clearTimeout(ping.tmuot); }
    if (ping.send) { clearTimeout(ping.send); }
  });
  that.on("pong", function(args) {
    that.log(1,"received pong");

    // kill timeout if set
    if (ping.tmout) { clearTimeout(ping.tmout); }

    // ping every minute
    // timeout after 5 seconds
    ping.send = setTimeout(function () {
      that.log(1,"sent ping");

      that.cmd("PING :"+that.config.host);

      ping.tmout = setTimeout(function () {
        that.log(1,"ping timeout");
        that.reconnect();
      }, 5000);
    }, 60000);
  });
};
util.inherits(Client, events.EventEmitter);

var proto = Client.prototype;

proto.log = function (lvl, arg) {
  if (this.config.dbg &&
      this.config.dbglvl >= lvl) {
    var date = new Date();
    console.log("["+
        date.toDateString()+" "+
        date.toLocaleTimeString()+"] "+arg);
  }
};

var createReply = function (method) {
  return function (target, msg) {
    if (msg === undefined)
      return this;
    msg.toString().split(/\r?\n/)
      .filter(function (v) {
        return v.length > 0;
      })
      .forEach(function (v) {
        this.cmd(method+" "+target+" :"+v, true);
      }, this);
    return this;
  };
};
proto.say = createReply("PRIVMSG");
proto.notice = createReply("NOTICE");
proto.me = function (target, msg) {
  return this.say(target, 
      "\x01ACTION "+msg+"\x01");
};
proto.ctcpReq = function (target, type, msg) {
  return this.say(target, 
      "\x01"+type+" "+msg+"\x01");
};
proto.ctcpRes = function (target, type, msg) {
  return this.notice(target, 
      "\x01"+type+" "+msg+"\x01");
};

proto.join = function (chan) {
  if (Array.isArray(chan)) {
    this.cmd("JOIN "+chan.join());
  } else {
    this.cmd("JOIN "+chan);
  }

  return this;
};
proto.part = function (chan, msg) {
  msg = (msg) ? " :"+msg : "";
  this.cmd("PART "+chan+msg);

  return this;
};

proto.connect = function () {
  var that = this;
  var config = that.config;
  var sock = that.socket = (that.config.ssl) ?
    new tls.TLSSocket(new net.Socket(), {
      isServer: false,
    }) : new net.Socket();

  // setup socket
  sock.setEncoding("utf8");
  sock.setTimeout(0);

  // init connection
  that.log(1,"connecting...");
  sock.connect(config.port, config.host);

  sock.on("error", function (err) {
    that.log(1,"socket error. "+
        "retrying in 10 secs.");
    setTimeout(function () {
      that.reconnect();
    }, 10000);
  });

  // only there for debug purposes
  sock.on("close", function (had_err) {
    if (had_err) {
      that.log(1,"closed with error");
    } else {
      that.log(1,"closed without error");
    }
  });

  // connection successful
  sock.on("connect", function () {
    // logging in
    var pass = config.pass;
    if (pass.length > 0)
      that.cmd("PASS "+pass);

    that.cmd("NICK "+config.nick);
    that.cmd("USER "+config.user+
        " 0 * :"+config.desc);
  });

  // line buffering..
  var buff = "";
  sock.on("data", function (chunk) {
    buff += chunk;

    var lines = buff.split("\r\n");
    buff = lines.pop();

    lines.forEach(function (line) {
      var res = ircutil.parseResponse(line);
      that.emit("raw", res);
    });
  });
};
proto.quit = function (msg) {
  var that = this;
  var sock = that.socket;

  that.cmd("QUIT"+((msg) ?
      " :"+msg : ""));

  that.util = {};
  sock.end();

  that.emit("disconnect");
};
proto.reconnect = function () {
  var that = this;
  var sock = that.socket;

  that.util = {};
  sock.destroy();

  that.connect();
};

// plugin loader function
proto.plugin = function (plugin) {
  var that = this;
  var events = Object.keys(plugin.events);
  console.log("Loading plugin: "+plugin.name);

  events.forEach(function (v) {
    if (Array.isArray(plugin.events[v])) {
      plugin.events[v].forEach(function (vv) {
        that.on(v, vv);
      });
    } else {
      that.on(v, plugin.events[v]);
    }
  });
};

module.exports = Client;
