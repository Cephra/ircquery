"use strict";

var util = require("util");
var net = require("net");
var tls = require("tls");
var events = require("events");
var handlers = require("./handlers");
var ircutil = require("./ircutil");
var queries = require("./queries");

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
  };
  // overwrite defaults
  if (typeof userconf === "object") {
    for (var key in conf) {
      if (userconf[key] !== undefined) {
        conf[key] = userconf[key];
      }
    }
  }
  conf.altnick = conf.nick;

  var user = queries.Users.call(this);
  //var channel = queries.Channels.call(this);

  // getter & setter
  Object.defineProperties(that, {
    user: {
      get: function () {
        return user;
      },
    },
    channel: {
      get: function () {
        return channel;
      },
    },
    nick: {
      get: function () {
        return that.config.nick;
      },
      set: function (v) {
        this.cmd("NICK "+v);
      },
    },
    host: {
      get: function () {
        return that.config.host;
      },
    },
    config: {
      get: function () {
        return conf;
      },
    },
  });

  // server supports
  this.supports = {};

  // sendHandle for sendWorker
  var sendHandle = {
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
      sendHandle.buf.push(data);
      if (sendHandle.delay === 0) {
        sendWorker(sendHandle);
      }
      return that;
    } else {
      // don't buffer...
      sendHandle.send(data);
      return that;
    }
  };

  // handlers
  this.on("raw", function (res) {
    that.log("<-- "+res.line);
    if (handlers.response[res.type]) {
      handlers.response[res.type].call(that, res);
    }
  });

  // received pong, send ping
  var timeout;
  this.on("pong", function(args) {
    // do nothing if retry is off
    if (!that.config.retry) {
      return;
    }

    // kill timeout if set
    if (timeout) { clearTimeout(timeout); }

    // ping every minute
    // timeout after 5 seconds
    setTimeout(function () {
      that.cmd("PING :"+that.host);

      timeout = setTimeout(function () {
        that.disconnect();
        that.connect();
      }, 5000);
    }, 60000);
  });
};
util.inherits(Client, events.EventEmitter);

var proto = Client.prototype;

proto.log = function (arg) {
  if (this.config.dbg) {
    var date = new Date();
    console.log("["+
        date.toDateString()+" "+
        date.toLocaleTimeString()+"] "+arg);
  }
};

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
proto.join = function (chan) {
  if (Array.isArray(chan)) {
    this.cmd("JOIN "+chan.join(","));
  } else {
    this.cmd("JOIN "+chan);
  }
  //this.emit("joining", chan);

  return this;
};
proto.part = function (chan, msg) {
  msg = (msg) ? " :"+msg : "";
  this.cmd("PART "+chan+msg);

  return this;
};
proto.connect = function () {
  if (this.hasQuit) {
    return;
  }
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
  that.log("connecting...");
  sock.connect(config.port, config.host);

  sock.on("error", function (err) {
    that.log("socket error"+
        "retrying in 10 secs.");
    setTimeout(function () {
      that.disconnect();
      that.connect();
    }, 10000);
  });

  // only there for debug purposes
  sock.on("close", function (had_err) {
    if (had_err) {
      that.log("closed with error");
    } else {
      that.log("closed without error");
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
  this.cmd("QUIT"+((msg) ?
      " :"+msg : ""));
  this.disconnect();
};
proto.disconnect = function (msg) {
  var that = this;
  var sock = that.socket;

  this.supports = {};
  sock.end();
};
module.exports = Client;
