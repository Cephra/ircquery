"use strict";

var Q = require("./ircutil").Q;

// this function takes a user string
// nick!~user@host and splits it into 
// nick, user and host allowing us
// to do queries on it
var parseUser = function (userstring) {
  var buildUser = function (nick, user, host) {
    return {
      nick: Q(nick),
      user: Q(user),
      host: Q(host),
    };
  };

  var raw = userstring;
  if (raw.indexOf("!") != -1) {
    var spltNick = raw.split("!");
    var spltHost = spltNick[1].split("@");
    
    return buildUser(spltNick[0],
        spltHost[0], spltHost[1]);
  } else {
    // userstring has just the nick
    return buildUser(raw,"","");
  }
};

// define an object to store 
// the response handlers in
var handlers = {};

handlers["PONG"] = function (res) {
  this.emit("pong", res.args);
};

handlers["PING"] = function (res) {
  // auto-respond to PING requests
  this.cmd("PONG :"+res.args);
};

handlers["433"] = function (res) {
  this.log(1,"nick already taken");

  // nick taken use 
  // alternative nickname
  this.nick = this.config.altnick;
  this.config.altnick += "_";
};

handlers["470"] = function (res) {
  var e = {
    from: function () {
      return res.params[1];
    },
    to: function () {
      return res.params[2];
    },
  };
  this.emit("redirect", e);
};

handlers["251"] = function (res) {
  // request multi prefix
  this.cmd("CAP REQ :multi-prefix");

  // ignite the ping pong chain
  // if retry is enabled
  if (this.config.retry) {
    this.cmd("PING :"+this.host);
  }

  // login successful
  if (!this.loggedIn) {
    this.emit("login");
    this.loggedIn = true;
  } else {
    this.emit("reconnect");
  }
};

handlers["NICK"] = function (res) {
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    to: function () {
      return res.params[0];
    },
  };

  // own nickname changed
  if (e.user().nick(this.nick)) {
    this.config.nick = e.to();
  }

  // emit nick change event
  this.emit("nick", e);
};

handlers["QUIT"] = function (res) {
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    msg: Q(res.args),
  };
  this.emit("quits", e);
};

handlers["PART"] = function (res) {
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    chan: Q(res.params[0]),
    msg: Q(res.args),
  };
  
  if (e.user().nick() === this.nick) {
    this.emit("parted", e);
  } else {
    this.emit("parts", e);
  }
};

handlers["KICK"] = function (res) {
  var that = this;
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    chan: Q(res.params[0]),
    target: Q(res.params[1]),
    msg: Q(res.args),
  };
  if (e.target(this.nick)) {
    e.rejoin = function () {
      that.join(e.chan());
    };
    this.emit("kicked", e);
  } else {
    this.emit("kicks", e);
  }
};

handlers["JOIN"] = function (res) {
  var that = this;
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    chan: Q(res.params[0]),
  };
  
  if (e.user().nick(this.nick)) {
    e.modes = function () {
      that.cmd("MODE "+e.chan());
    };
    e.greet = function (greeting) {
      that.say(e.chan(), greeting);
    };
    this.emit("joined", e);
  } else {
    this.emit("joins", e);
  }
};

handlers["MODE"] = function (res) {
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    target: Q(res.params[0]),
  };
  var mask = (res.params[1] || res.args).split("");

  if (this.util.isChan(e.target())) {
    e.mask = function () {
      return {
        op: mask[0],
        mode: mask[1],
      };
    };
    e.arg = function () {
      return res.params[2] || "";
    };
    if (this.util.isChanMode(e.mask().mode)) {
      this.emit("chanmode", e);
    } else {
      this.emit("nickmode", e);
    }
  } else {
    this.emit("usermode");
  }
};

handlers["353"] = function (res) {
  var nicks = res.args.split(" ");
  var e = {
    chan: Q(res.params[2]),
    nicks: function () {
      return nicks;
    },
  };
  this.emit("names", e);
};

handlers["324"] = function (res) {
  var where = res.params[1];
  var flags = res.params[2];

  this.emit("chanflags", where, flags);
};

handlers["329"] = function (res) {
  var chan = res.params[1];
  var timestamp = parseInt(res.params[2]);

  this.emit("chantime", chan, timestamp);
};

var msgHandle = function (res) {
  var that = this;
  var user = parseUser(res.prefix);
  var e = {
    user: function () {
      return user;
    },
    dest: Q(res.params[0]),
    text: Q(res.args),
  };

  return e;
};

handlers["NOTICE"] = function (res) {
  var that = this;
  var e = msgHandle.call(that, res);

  this.emit("notice", e);
};

handlers["PRIVMSG"] = function (res) {
  var that = this;
  var e = msgHandle.call(that, res);
  var ctcp, action;

  // check if it's a /me message
  if ((ctcp = e.text(/^\x01ACTION\s(.*)\x01$/))) {
    action = ctcp[1];
  }
  e.getAction = Q(action || "");

  // qry the user
  var user = that.qry(e.user().nick());

  // msg is a PM
  if (e.dest(that.nick)) {

    if (!ctcp &&
        (ctcp = e.text(/^\x01(\w+)(.*)\x01$/))) {
      e.type = Q(ctcp[1]);
      e.args = Q(ctcp[2]);
      e.res = function (arg) {
        user.ctcpRes(e.type(),arg);
      };

      that.emit("ctcp", e);
    } else {
      e.respond = user.say;

      this.emit("privmsg", e);
    }
  } else {
    // or a channel message
    var chan = that.qry(e.dest());

    // respond to the channel
    // or highlight sender
    e.respond = chan.say;
    e.respondTo = function (msg) {
      chan.sayTo(e.user().nick(),msg);
    };
    e.respondPrivate = user.say;

    // we got highlighted? 
    var reHighlight = 
      new RegExp("(?:^|[\\s#])"+
          this.nick+
          "(?:$|[\\s.!?:])", "i");
    e.isHighlight = (e.text(reHighlight) !== -1);

    // emit the event
    this.emit("chanmsg", e);
  }
};

handlers["005"] = function (res) {
  var split = res.params.slice(1);
  var obj = this.util;
  split.forEach(function (v) {
    var match;
    if ((match = v.match(/([A-Z]+)=(.*)/))) {
      var param = match[1];
      var value = match[2];

      switch (param) {
      case "CHANTYPES":
        var chanRE = new RegExp("^["+value+"]");
        obj.isChan = function (s) {
          return (s.search(chanRE) !== -1);
        };
        break;
      case "CHANMODES":
        var modes = value.split(",");

        var modeRE = new RegExp("^["+
            modes[0]+
            modes[1]+
            modes[2]+
            modes[3]+"]$");

        obj.isChanMode = function (s) {
          return (s.search(modeRE) !== -1);
        };
        break;
      case "PREFIX":
        var re = /\((.+)\)(.+)/;
        var tmp = value.split(re);

        var mappings = {
          mode: tmp[1].split(""),
          prefix: tmp[2].split(""),
        };

        var prefixRE = new RegExp("^(["+
            tmp[2]+"]*)(.*)$");
        obj.splitPrefix =
          function (str) {
            var tmp = str.match(prefixRE); 
            return {
              modes: (function (prefs) {
                prefs.forEach(function (v,i,a) {
                  a[i] = obj.prefixToMode(v);
                });
                return prefs;
              }(tmp[1].split(""))),
              nick: tmp[2],
            };
          };

        var a2b = function (a, b, c) {
          var i = a.indexOf(c);
          return b[i];
        };
        obj.modeToPrefix =
          function (c) {
            return a2b(mappings.mode, 
                mappings.prefix, c);
          };
        obj.prefixToMode =
          function (c) {
            return a2b(mappings.prefix, 
                mappings.mode, c);
          };
        break;
      }
    }
  }, this);
};

// handlers for the server responses
module.exports.response = handlers;
