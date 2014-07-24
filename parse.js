var parse = module.exports = {
    "PING": function (res) {
        this.cmd("PONG :"+res.args);
    },
    "NOTICE": function (res) {

    },
    "PRIVMSG": function (res) {
        var usr = user(res.prefix);

        if (res.params[0] == "#") {
            this.emit("chanmsg", 
                    usr,
                    res.params,
                    res.args);
        } else { 
            this.emit("privmsg", 
                    usr,
                    res.args);
        }
    },
};
var user = function (user) {
    // split up the sender string
    var nicksplt = user.split("!");
    var hostsplt = nicksplt[1].split("@");

    // build the usr object and return it
    return {
        nick: nicksplt[0],
        user: hostsplt[0],
        host: hostsplt[1],
    };
};
module.exports.user = user;
module.exports.res = function (line) {
    var response = {
        line: line,
    };

    // first stage RE
    var re1 = 
        /^:([^\s]+)\s([^\s]+)\s(.+)$/;
    var re2 = 
        /^([^\s]+)\s:(.+)$/;

    var _line;
    if (_line = line.match(re1)) {
        response.type = _line[2];
        response.prefix = _line[1];

        // arguments?
        var i;
        if (i = _line[3].indexOf(":")) {
            var splt = [
                _line[3].substring(0,i-1),
                _line[3].substring(i+1),
            ];
            response.params = splt[0];
            response.args = splt[1];
        } else { // no arguments
            response.params = _line[3];
        }
    } else if (_line = line.match(re2)) {
        response.type = _line[1];
        response.args = _line[2];
    }

    return response;
};
