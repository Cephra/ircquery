"use strict";

// q creates a 
// special query function
// which can be used to access 
// a value (v) in various ways
module.exports.Q = function (v) {
  return function (m, cb) {
    if (!m) {
      return v;
    } else {
      var r;
      if (typeof m === "string") {
        r = (v === m);
      } else if (m instanceof RegExp) {
        r = v.match(m);
      }
      if (cb && r &&
            typeof cb === "function") {
          cb(r);
      } else { return r; }
    }
  };
};

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
