"use strict";

// parse irc server responses into an
// object we can work with
module.exports.resParse = function (line) {
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
      i++;
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
    response.params =
      response.params.split(" ");
  } else if ((_line = line.match(reShort))) {
    response.type = _line[1];
    response.args = _line[2];
  }

  return response;
};


// parse masked irc user string
// into an object representing a user
module.exports.userParse = function (userstring) {
  var obj = {};

  obj.raw = userstring;
  if (obj.raw.indexOf("!") != -1) {
    var spltNick = obj.raw.split("!");
    var spltHost = spltNick[1].split("@");
    
    // set nick
    obj.nick = spltNick[0];

    // and user@host
    obj.user = spltHost[0];
    obj.host = spltHost[1];
  } else {
    obj.nick = obj.raw;
  }

  return obj;
};
