"use strict";

// magic
var q = function (v) {
  return function (m, cb) {
    if (!m) {
      return v;
    } else {
      var r, mr;
      if (typeof m === "string") {
        r = (v === m)
      } else if (m instanceof RegExp) {
        r = ((mr = v.match(m)) !== null);
      }
      if (cb && r &&
            typeof cb === "function") {
          cb(mr);
      } else { return r; }
    }
  };
};

var parseUser = function (userstring) {
  var buildUser = function (nick, user, host) {
    return {
      nick: q(nick),
      user: q(user),
      host: q(host),
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

// handlers for the server responses
module.exports.response = {
  "PONG": function (res) {
    this.emit("pong", res.args);
  },
  "PING": function (res) {
    // auto-respond to PING requests
    this.cmd("PONG :"+res.args);
  },
  // ERR_NICKNAMEINUSE
  "433": function (res) {
    this.log(1,"nick taken > changing");
    this.config.altnick += "_";
    this.nick = this.config.altnick;
  },
  // ERR_LINKCHANNEL
  "470": function (res) {
    var e = {
      from: function () {
        return res.params[1];
      },
      to: function () {
        return res.params[2];
      },
    };
    this.emit("redirect", e);
  },
  // RPL_LUSERCLIENT
  "251": function (res) {
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
  },
  "NICK": function (res) {
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
  },
  "QUIT": function (res) {
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      msg: function () {
        return res.args;
      },
    };
    this.emit("quits", e);
  },
  "PART": function (res) {
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      chan: q(res.params[0]),
      msg: q(res.args),
    };
    
    if (e.user().nick() === this.nick) {
      this.emit("parted", e);
    } else {
      this.emit("parts", e);
    }
  },
  "KICK": function (res) {
    var that = this;
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      chan: q(res.params[0]),
      target: q(res.params[1]),
      msg: q(res.args),
    };
    if (e.target(this.nick)) {
      e.rejoin = function () {
        that.join(e.chan());
      };
      this.emit("kicked", e);
    } else {
      this.emit("kicks", e);
    }
  },
  "JOIN": function (res) {
    var that = this;
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      chan: q(res.params[0]),
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
  },
  "MODE": function (res) {
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      target: q(res.params[0]),
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
  },
  // RPL_NAMEREPLY
  "353": function (res) {
    var nicks = res.args.split(" ");
    var e = {
      chan: q(res.params[2]),
      nicks: function () {
        return nicks;
      },
    };
    this.emit("names", e);
  },
  // RPL_CHANNELMODEIS
  "324": function (res) {
    var where = res.params[1];
    var flags = res.params[2];

    this.emit("chanflags", where, flags);
  },
  // RPL_CREATIONTIME
  "329": function (res) {
    var chan = res.params[1];
    var timestamp = parseInt(res.params[2]);

    this.emit("chantime", chan, timestamp);
  },
  "NOTICE": function (res) {
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      text: q(res.args),
    };

    this.emit("notice", e);
  },
  "PRIVMSG": function (res) {
    var that = this;
    var user = parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      dest: q(res.params[0]),
      text: q(res.args),
    };

    if (e.dest(this.nick)) {
      e.respond = function (response) {
        that.say(e.user().nick(),
            response);
      };
      this.emit("privmsg", e);
    } else { 
      e.respond = function (response) {
        that.say(e.dest(), response);
      };
      e.respondTo = function (response) {
        that.say(e.dest(), 
            e.user().nick()+": "+response);
      };
      e.respondPrivate = function (response) {
        that.say(e.user().nick(), response);
      };

      // we got highlighted? 
      var reHighlight = 
        new RegExp("(?:^|[\\s#])"+
            this.nick+
            "(?:$|[\\s.!?:])", "i");
      e.isHighlight = (e.text(reHighlight) !== -1);

      this.emit("chanmsg", e);
    }
  },
  // RPL_ISUPPORT
  "005": function (res) {
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
  },
};
