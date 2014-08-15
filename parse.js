var parse = module.exports = {
    "PING": function (res) {
        this.cmd("PONG :"+res.args);
    },
    "JOIN": function(res) {
        var from = parse.sender(res.prefix);
        
        if (from.nick === this._opts.nick) {
            this.channels.add(res.args);
            this.log("added channel: "+res.args);
            this.emit("jointo", res.args);
        } else {
            this.emit("joinin", from, res.args);
        }
    },
    "353": function (res) {
        var chan = 
            res.params.split(/\s[=*@]\s/)[1];
        var names = res.args.split(" ");

        this.log("receiving names in "+chan);

        // pass name array to channel
        this.channels[chan].add(names);
    },
    "366": function (res) {
        var chan = 
            res.params.split(" ")[1];
        this.say("szt", 
                chan+": "+
                this.channels[chan].names.length);
    },
    "NOTICE": function (res) {
        var from = parse.sender(res.prefix);

        this.emit("notice",
                from,
                res.params,
                res.args);
    },
    "PRIVMSG": function (res) {
        var from = parse.sender(res.prefix);

        if (res.params[0] == "#") {
            this.emit("chanmsg", 
                    from,
                    res.params,
                    res.args);
        } else { 
            this.emit("privmsg", 
                    from,
                    res.args);
        }
    },
    "PART": function(res) {
        var from = parse.sender(res.prefix);
        
        if (from.nick === this._opts.nick) {
            this.emit("partfrom", res.args);
        } else {
            this.emit("partin", from, res.args);
        }
    },
};
var sender = function (sender) {
    User = function (nick, user, host) {
        this.nick = nick;
        this.user = user;
        this.host = host;
    };
    if (sender.indexOf("!") > -1) {
        // split up the sender string
        var nicksplt = sender.split("!");
        var hostsplt = nicksplt[1].split("@");

        // build the usr object and return it
        return new User(
            nicksplt[0],
            hostsplt[0],
            hostsplt[1]);
    } else {
        return new User(sender);
    }
};
module.exports.sender = sender;
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
