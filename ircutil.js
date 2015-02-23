"use strict";

// parse irc server responses into an
// object we can work with
module.exports.parseResponse = function (line) {
  var response = {};
  response.line = line;

  // split regex
  var reLong = /^:([^\s]+)\s([^\s]+)\s(.+)$/;
  var reShort = /^([^\s]+)\s:(.+)$/;

  var _line;
  if ((_line = line.match(reLong))) {
    response.type = _line[2];
    response.prefix = _line[1];

    // arguments?
    var i = _line[3].indexOf(" :");
    if (i != -1) {
      i++; // skip the space
      var splt = [
        _line[3].substring(0,i-1),
        _line[3].substring(i+1),
      ];
      response.params = splt[0];
      response.args = splt[1];
    } else { // no arguments
      response.params = 
        (_line[3][0] === ":") ? 
        _line[3].substr(1) : _line[3];
    }
    response.params = response.params.split(" ");
  } else if ((_line = line.match(reShort))) {
    response.type = _line[1];
    response.args = _line[2];
  }

  return response;
};


// parse masked irc user string
// into an object representing a user
module.exports.parseUser = function (userstring) {
  var buildUser = function (nick, user, host) {
    return {
      getNick: function () {
        return nick;
      },
      getUser: function () {
        return user;
      },
      getHost: function () {
        return host;
      },
    };
  };

  var raw = userstring;
  if (raw.indexOf("!") != -1) {
    var spltNick = raw.split("!");
    var spltHost = spltNick[1].split("@");
    
    return buildUser(spltNick[0],
        spltHost[0], spltHost[1]);
  } else {
    return buildUser(raw);
  }
};
