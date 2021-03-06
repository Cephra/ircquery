"use strict";

var Q = require("./ircutil").Q;

module.exports.create = function () {
  var that = this;

  // DATABASES //
  var users = {};
  var userChans = {};
  var chans = {};

  // CONSTRUCTORS //
  var createChan = function (chan) {
    var obj = {};

    obj.say = function (msg) {
      that.say(chan, msg);
      return obj;
    };
    obj.sayTo = function (nick, msg) {
      that.say(chan, nick+": "+msg);
      return obj;
    };
    obj.notice = function (msg) {
      that.notice(chan, msg);
      return obj;
    };
    obj.me = function (msg) {
      that.me(chan, msg);
      return obj;
    };

    obj.part = function (msg) {
      that.part(chan, msg);
      return obj;
    };

    obj.users = function () {
      var list = [];
      for (var user in userChans) {
        var c = userChans[user][chan];
        if (c !== undefined) {
          list.push(user);
        }
      }
      return list;
    };

    return obj;
  };
  var createUser = function (nick) {
    var attributes = {};
    var obj = {};

    // communication
    obj.say = function (msg) {
      that.say(nick, msg);
      return obj;
    };
    obj.notice = function (msg) {
      that.notice(nick, msg);
      return obj;
    };
    obj.me = function (msg) {
      that.me(nick, msg);
      return obj;
    };

    // ctcp functions
    obj.ctcpReq = function (type, arg) {
      that.ctcpReq(nick, type, arg);
      return obj;
    };
    obj.ctcpRes = function (type, arg) {
      that.ctcpRes(nick, type, arg);
      return obj;
    };

    obj.kick = function (chan, msg) {
      that.cmd("KICK "+nick+" "+chan+" :"+msg);
      return obj;
    };

    obj.chans = function () {
      return Object.keys(userChans[nick] || {});
    };

    obj.modes = function (chan) {
      var obj = (userChans[nick] || 
          {})[chan] ||
      { modes: [] };

      return obj.modes;
    };

    obj.attr = function (name, val) {
      if (name === undefined) {
        return attributes;
      }
      if (val !== undefined) {
        attributes[name] = val;
      } else {
        return attributes[name];
      }
    };

    return obj;
  };

  // CHAN METHODS //
  var addChan = function (chan) {
    if (chans[chan] !== undefined) {
      return;
    }
    chans[chan] = createChan(chan);
    that.log(1,chan+" was added to chan db");
  };
  var delChan = function (chan) {
    chans[chan].users().forEach(function (v) {
      delUserChan(v,chan);
    });
    delete chans[chan];
    that.log(1,chan+" was removed from chan db");
  };

  // USER METHODS //
  var addUser = function (nick) {
    if (users[nick] !== undefined) {
      return;
    }
    users[nick] = createUser(nick);
    that.log(1,nick+" was added to user db");
  };
  var addUserChan = function (nick, chan, modes) {
    userChans[nick] = userChans[nick] || {}; 
    userChans[nick][chan] = {
      modes: modes || [],
    };
    that.log(1,nick+" is a member of "+chan);
  };
  var delUser = function (nick) {
    delete users[nick];
    delete userChans[nick];
    that.log(1,nick+" was removed from user db");
  };
  var delUserChan = function (nick, chan) {
    delete userChans[nick][chan];
    that.log(1,nick+" left "+chan);

    var chans = userChans[nick];
    var chanCount = Object.keys(chans).length;
    if (chanCount === 0) {
      delUser(nick);
      that.log(1,nick+" left all channels");
    }
  };
  var chngNick = function (from, to) {
    users[to] = users[from];
    userChans[to] = userChans[from];

    delete users[from];
    delete userChans[from];

    that.log(1,from+" renamed to "+to);
  };
  var chngMode = function (nick, chan, mask) {
    var modes = userChans[nick][chan].modes;
    var op = mask.op;
    var mode = mask.mode;

    var i = modes.indexOf(mode);
    if (i !== -1 && op === "-") {
      modes.splice(i,1);
    } else if (op === "+") {
      modes.push(mode);
    }
  };

  // EVENTS //
  that.on("names", function (e) {
    e.nicks().forEach(function (nick) {
      var splt = that.util.splitPrefix(nick);
      addUser(splt.nick);
      addUserChan(splt.nick, e.chan(), splt.modes);
    });
  }).on("joins", function (e) {
    var nick = e.user().nick();
    addUser(nick);
    addUserChan(nick, e.chan());
  }).on("parts", function (e) {
    delUserChan(e.user().nick(),e.chan());
  }).on("kicks", function (e) {
    delUserChan(e.target(),e.chan());
  }).on("quits", function (e) {
    delUser(e.user().nick());
  }).on("nick", function (e) {
    chngNick(e.user().nick(), e.to());
  }).on("nickmode", function (e) {
    chngMode(e.arg(), e.target(), e.mask());
  }).on("joined", function (e) {
    addChan(e.chan());
  }).on("parted", function (e) {
    delChan(e.chan());
  }).on("kicked", function (e) {
    delChan(e.chan());
  }).on("reconnect", function () {
    users = {};
    userChans = {};

    that.join(Object.keys(chans));
  });

  // TODO caching, request parsing
  return function (str, cb) {
    if (that.util.isChan(str)) {
      if (chans[str] !== undefined) {
        return chans[str];
      }
      return createChan(str);
    } else {
      if (users[str] !== undefined) {
        return users[str];
      }
      return createUser(str);
    }
  };
};

