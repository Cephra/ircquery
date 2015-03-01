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
    this.log("nick taken");
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
    this.cmd("PING :"+this.host);

    // login successful
    this.emit("login");
  },
  "NICK": function (res) {
    var who = ircutil.parseUser(res.prefix);
    var to = res.args;

    // own nickname changed
    if (who.nick() === this.nick) {
      this.config.nick = to;
      return;
    }

    // emit nick change event
    this.emit("nick", who.nick(), to);
  },
  "QUIT": function (res) {
    var who = ircutil.parseUser(res.prefix);

    // throw quit event
    this.emit("quit", who, res.args);
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
    var kick = {
      who: function () {
        return ircutil.parseUser(res.prefix);
      },
      dest: function () {
        return res.params[0];
      },
      target: function () {
        return res.params[1];
      },
    };
    // either remove channel or nick
    if (kick.target() === this.nick) {
      kick.rejoin = function () {
        that.join(kick.dest());
      };
      this.emit("kicked", kick);
    } else {
      this.emit("kicks", kick);
    }
  },
  "JOIN": function (res) {
    var that = this;
    var who = ircutil.parseUser(res.prefix);
    var join = {
      sender: function () {
        return who;
      },
      dest: function () {
        return res.params[0];
      },
    };
    
    if (join.sender().nick() === this.nick) {
      join.modes = function () {
        that.cmd("MODE "+join.dest());
      };
      join.greet = function (greeting) {
        that.say(join.dest(), greeting);
      };
      this.emit("joined", join);
    } else {
      this.emit("joins", join);
    }
  },
  "MODE": function (res) {
    var who = ircutil.parseUser(res.prefix);

    if (res.params[0][0] === "#") {
      var where = res.params[0];
      var mode = res.params[1];
      var arg = (res.params[2]) ? 
        undefined : res.params[2];

      this.emit("chanmode", where, who, mode, arg);
    } else {
      this.emit("usermode");
    }
  },
  // RPL_NAMEREPLY
  "353": function (res) {
    var nicks = res.args.split(" ");
    var names = {
      dest: function () {
        return res.params[2];
      },
      nicks: function () {
        return nicks;
      },
    };
    this.emit("names", names);
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
    var note = {
      sender: ircutil.parseUser(res.prefix),
      dest: res.params,
      text: res.args,
    };

    this.emit("notice", note);
  },
  "PRIVMSG": function (res) {
    var that = this;
    var sender = ircutil.parseUser(res.prefix);
    var msg = {
      sender: function () {
        return sender;
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
        that.say(msg.sender().nick(),
            response);
      };
      this.emit("privmsg", msg);
    } else { 
      msg.respond = function (response) {
        that.say(msg.dest(), response);
      };
      msg.respondTo = function (response) {
        that.say(msg.dest(), 
            msg.sender().nick()+": "+response);
      };
      msg.respondPrivate = function (response) {
        that.say(msg.sender().nick(), response);
      };

      // we got highlighted? 
      var reHighlight = 
        new RegExp("(?:\\s|^)"+
            this.nick+
            "(?:\\s|\\.|!|\\?|:|$)", "i");
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

          // There is probably no need to populate this
          // this.supports.modesprefixes = mappings;

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
