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
  "433": function (res) {
    // nickname already taken
    // append underscore

    this.nick += "_";
  },
  "251": function (res) {
    // request multi prefix
    this.cmd("CAP REQ :multi-prefix");

    // ignite the ping pong
    this.cmd("PING :"+this.server);

    // login successful
    this.emit("login");
  },
  "NICK": function (res) {
    var who = ircutil.userParse(res.prefix);
    var to = res.args;

    // own nickname changed
    // transparent update
    if (who.nick === this.nick) {
      this.config.nick = to;
      return;
    }

    // emit nick change event
    this.emit("nick", who.nick, to);
  },
  "QUIT": function (res) {
    var who = ircutil.userParse(res.prefix);

    // throw quit event
    this.emit("quit", who, res.args);
  },
  "PART": function (res) {
    var who = ircutil.userParse(res.prefix);
    var where = res.params[0];
    
    if (who.nick === this.nick) {
      this.emit("partfrom",
          where,
          res.args);
    } else {
      this.emit("partin",
          where, 
          who, 
          res.args);
    }
  },
  "KICK": function (res) {
    var who = ircutil.userParse(res.prefix);
    var where = res.params[0];

    // either remove channel or nick
    if (res.params[1] === this.nick) {
      var chan = this.channel(where);
      if (chan.rejoin) {
        this.join(where, true);
      }
      this.emit("kicked",
          where,
          who,
          res.args);
    } else {
      this.emit("userkicked",
          where, 
          who,
          res.params[1],
          res.args);
    }
  },
  "JOIN": function (res) {
    var who = ircutil.userParse(res.prefix);
    var where = res.params[0];
    
    if (who.nick === this.nick) {
      this.cmd("MODE "+where);
      this.emit("joined", where);
    } else {
      this.emit("userjoined", where, who);
    }
  },
  "MODE": function (res) {
    var who = ircutil.userParse(res.prefix);

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
  "353": function (res) {
    var where = res.params[2];
    var nicks = res.args.split(" ");
    nicks.forEach(function (nick) {
      this.emit("names", where, nick);
    }, this);
  },
  "324": function (res) {
    var where = res.params[1];
    var flags = res.params[2];

    this.emit("chanflags", where, flags);
  },
  "329": function (res) {
    var chan = res.params[1];
    var timestamp = parseInt(res.params[2]);

    this.emit("chantime", chan, timestamp);
  },
  "NOTICE": function (res) {
    var who = ircutil.userParse(res.prefix);

    this.emit("notice",
        who,
        res.params,
        res.args);
  },
  "PRIVMSG": function (res) {
    var who = ircutil.userParse(res.prefix);
    var where = res.params[0];

    if (where[0] === "#") {
      this.emit("chanmsg", 
          where,
          who,
          res.args);
    } else { 
      this.emit("privmsg", 
          who,
          res.args);
    }
  },
  "005": function (res) {
    var split = res.params.slice(1);
    split.forEach(function (v) {
      var match;
      if ((match = v.match(/([A-Z]+)=(.*)/))) {
        var param = match[1];
        var value = match[2];
        switch (param) {
        case "CHANTYPES":
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
          var prefs = value.split(re);

          this.supports.modeprefix = 
            prefs[2].split("");
          this.supports.prefixmode = 
            prefs[1].split("");
          break;
        }
      }
    }, this);
  },
};
