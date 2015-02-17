// Channel object
var Channel = function (irc, name, rejoin) {
  var that = this;

  Object.defineProperties(this, {
    "name": {
      get: function () {
        return name;
      },
    },
    "rejoin": {
      get: function () {
        return rejoin;
      },
    },
  });

  // flags and creation date
  var arrFlags = [];
  var dateCreated;

  // per mode nick list
  var listNicks = {};
  listNicks [""] = [];
  irc.supports.prefixmode.forEach(function (mode) {
    listNicks[mode] = [];
  });


  var chanNames = function (where, nick) {
    if (where !== name) return;

    var prefixes = irc.supports.modeprefix.join("");
    var prefixSplit = nick.match("(["+prefixes+"]*)(.*)");
    var split = {
      nick: prefixSplit[2],
      prefixes: prefixSplit[1].split(""),
    };

    // nick has at least
    // one mode set to it
    if (split.prefixes.length > 0) {
      split.prefixes.forEach(function (prefix) {
        var i = irc.supports.modeprefix.indexOf(prefix);
        var mode = irc.supports.prefixmode[i];
        listNicks[mode].push(split.nick);
      });
    }

    listNicks[""].push(split.nick);
  };

  var nickAdd = function (where, nick) {
    if (where !== name) return;

    listNicks[""].push(nick.nick);
  };
  var nickDel = function () {
    var l = Object.keys(arguments).length;
    var where, nick;
    if (l === 2) {
      // QUIT
      where = name;
      nick = arguments[0];
    } else if (l === 3) {
      // PART
      where = arguments[0];
      nick = arguments[1];
    } else if (l === 4) {
      // KICK
      where = arguments[1];
      nick = arguments[2];
    }
    if (where !== name) return;

    // search lists for nick 
    // then delete nick 
    for (key in listNicks) {
      var i = listNicks[key].indexOf(nick);
      if (i != -1) {
        listNicks[key].splice(i,1);
      }
    }
  };

  var nickCh = function (where, from, to) {
    for (key in listNicks) {
      var i = listNicks[key].indexOf(from);
      listNicks[key][i] = to;
    }
  };
  var chanMode = function (where, who, mode, arg) {
    if (where !== name) return;

    //var op = flags.slice(0,1);
    //var flags = flags.slice(1);

    //flags.forEach(function (v) {
    //    if (op === "+") {
    //      arrFlags.push(v);
    //    } else {
    //      var i = arrFlags.indexOf(v);
    //      arrFlags.splice(i,1);
    //    }
    //});
  };

  var chanFlags = function (where, flags) {
    if (where !== name) return;

    // fill the flags in
    arrFlags = flags.slice(1).split("");
  };
  var chanCreated = function (where, timestamp) {
    if (where !== name) return;

    dateCreated = new Date(timestamp*1000);
  };

  var chanInit = function (where) {
    if (where !== name) return;

    // channel information
    irc.on("chanflags", chanFlags);
    irc.on("chancreated", chanCreated);

    // nicklist reply
    irc.on("names", chanNames);

    // nick insertion
    irc.on("joinin", nickAdd);

    // nick removal
    irc.on("partin", nickDel);
    irc.on("kickin", nickDel);
    irc.on("quit", nickDel);

    // changes
    irc.on("nick", nickCh);
    irc.on("chanmode", chanMode);

    // remove handler
    this.log(name+" successfully initialized.");
    this.removeListener("jointo", chanInit);
  };
  irc.on("jointo", chanInit);

  var chanDisable = function (where) {
    
  };
  irc.on("partfrom", chanDisable);
  if (!rejoin) {
    irc.on("kickfrom", chanDisable);
  }

  // send msg to this channel
  this.say = function (msg) {
    irc.say(that.name, msg);
    return irc;
  };
  // part with msg
  this.part = function (msg) {
    irc.part(that.name, msg);
    return irc;
  };
};

// Builds a ChannelQuery object
var Channels = function () {
  var that = this;
  var channels = [];

  // channel query function
  var queryLast = {};
  var query = function (name) {
    // return cached response
    if (name === queryLast.name) {
      return queryLast.channel;
    }

    var channel;
    channels.every(function (v) {
      if (v.name === name) {
        channel = v;
        return false;
      }
      return true;
    });

    // cache response
    queryLast.name = name;
    queryLast.channel = channel;
    return channel;
  };
  // add channel to the list
  query.add = function (name, rejoin) {
    rejoin = (rejoin === undefined) ?
      true : Boolean(rejoin);

    var chan = new Channel(that, name, rejoin);

    channels.push(chan);
  };
  // delete channel from the list
  query.del = function (name) {
    // delete cache ? 
    if (queryLast.name === name) {
      queryLast = {};
    }

    // remove channel object
    channels = channels.filter(function (v) {
      if (v.name === name) {
        that.removeAllListeners(v.name+":nickadd");
        that.removeAllListeners(v.name+":nickdel");
        that.removeAllListeners(v.name+":nickch");
        that.removeAllListeners(v.name+":flags");
        return false;
      };
      return true;
    });
  };
  // execute for each channel
  query.each = function (callback, thisArg) {
    channels.forEach(callback, thisArg);
  };

  // return the ChannelQuery
  return query;
};
module.exports.Channels = Channels;
