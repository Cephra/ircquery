"use strict";

var ircutil = require("./ircutil");

// handlers for the server responses
// every function executed client scope 
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
    this.log("nick taken > changing");
    this.config.altnick += "_";
    this.nick = this.config.altnick;
  },
  // ERR_LINKCHANNEL
  "470": function (res) {
    var from = res.params[1];
    var to = res.params[2];
    this.emit("redirect", from, to);
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

    // set a global connected flag

    // login successful
    this.emit("login");
  },
  "NICK": function (res) {
    var user = ircutil.parseUser(res.prefix);
    var change = {
      user: function () {
        return user;
      },
      to: function () {
        return res.args;
      },
    };

    // own nickname changed
    if (change.user().nick() === this.nick) {
      this.config.nick = change.to();
      return;
    }

    // emit nick change event
    this.emit("nick", change);
  },
  "QUIT": function (res) {
    var user = ircutil.parseUser(res.prefix);
    var e = {
      user: function () {
        return user;
      },
      msg: function () {
        return res.args;
      },
    }
    this.emit("quit", e);
  },
  "PART": function (res) {
    var who = ircutil.parseUser(res.prefix);
    var where = res.params[0];
    
    if (who.nick() === this.nick) {
      this.emit("parted",
          where,
          res.args);
    } else {
      this.emit("parts",
          where, 
          who, 
          res.args);
    }
  },
  "KICK": function (res) {
    var that = this;
    var user = ircutil.parseUser(res.prefix);
    var kick = {
      user: function () {
        return user;
      },
      chan: function () {
        return res.params[0];
      },
      target: function () {
        return res.params[1];
      },
    };
    if (kick.target() === this.nick) {
      kick.rejoin = function () {
        that.join(kick.chan());
      };
      this.emit("kicked", kick);
    } else {
      this.emit("kicks", kick);
    }
  },
  "JOIN": function (res) {
    var that = this;
    var user = ircutil.parseUser(res.prefix);
    var join = {
      user: function () {
        return user;
      },
      chan: function () {
        return res.params[0];
      },
    };
    
    if (join.user().nick() === this.nick) {
      join.modes = function () {
        that.cmd("MODE "+join.chan());
      };
      join.greet = function (greeting) {
        that.say(join.chan(), greeting);
      };
      this.emit("joined", join);
    } else {
      this.emit("joins", join);
    }
  },
  "MODE": function (res) {
    // TODO put this into the new object-based form
    var user = ircutil.parseUser(res.prefix);

    if (res.params[0][0] === "#") {
      var where = res.params[0];
      var mode = res.params[1];
      var arg = (res.params[2]) ? 
        undefined : res.params[2];

      this.emit("chanmode", where, user, mode, arg);
    } else {
      this.emit("usermode");
    }
  },
  // RPL_NAMEREPLY
  "353": function (res) {
    var nicks = res.args.split(" ");
    var e = {
      chan: function () {
        return res.params[2];
      },
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
    var user = ircutil.parseUser(res.prefix);
    var note = {
      user: function () {
        return user;
      },
      dest: function () {
        return res.params[0];
      },
      text: function () {
        return res.args;
      },
    };

    this.emit("notice", note);
  },
  "PRIVMSG": function (res) {
    var that = this;
    var user = ircutil.parseUser(res.prefix);
    var msg = {
      user: function () {
        return user;
      },
      dest: function () {
        return res.params[0];
      },
      text: function () {
        return res.args;
      },
    };

    if (msg.dest() === this.nick) {
      msg.respond = function (response) {
        that.say(msg.user().nick(),
            response);
      };
      this.emit("privmsg", msg);
    } else { 
      msg.respond = function (response) {
        that.say(msg.dest(), response);
      };
      msg.respondTo = function (response) {
        that.say(msg.dest(), 
            msg.user().nick()+": "+response);
      };
      msg.respondPrivate = function (response) {
        that.say(msg.user().nick(), response);
      };

      // we got highlighted? 
      var reHighlight = 
        new RegExp("(?:^|[\\s#])"+
            this.nick+
            "(?:$|[\\s.!?:])", "i");
      msg.isHighlight = 
        (msg.text().search(reHighlight)!== -1) ?
        true : false;

      this.emit("chanmsg", msg);
    }
  },
  // RPL_ISUPPORT
  "005": function (res) {
    // TODO add useful functions to the supports object 
    var split = res.params.slice(1);
    split.forEach(function (v) {
      var match;
      if ((match = v.match(/([A-Z]+)=(.*)/))) {
        var param = match[1];
        var value = match[2];
        switch (param) {
        case "CHANTYPES":
          // maybe make this a regex
          this.supports.chantypes = value;
          break;
        case "CHANMODES":
          var modes = value.split(",");
          this.supports.chanmodes = {
            A: modes[0],
            B: modes[1],
            C: modes[2],
            D: modes[3],
          };
          break;
        case "PREFIX":
          var re = /\((.+)\)(.+)/;
          var tmp = value.split(re);

          var mappings = {
            mode: tmp[1].split(""),
            prefix: tmp[2].split(""),
          };

          var a2b = function (a, b, c) {
            var i = a.indexOf(c);
            return b[i];
          };

          this.supports.modeToPrefix =
            function (c) {
              return a2b(mappings.mode, 
                  mappings.prefix, c);
            };
          this.supports.prefixToMode =
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
