var parse = module.exports = {
    "PING": function (res) {
        this.cmd("PONG :"+res.args);
    },
    "NICK": function (res) {
        var who = parse.sender(res.prefix);
        var to = res.args;

        // change nick in all channels
        this.channels.each(function (chan) {
            chan.change(who.nick, to);
        });
    },
    "QUIT": function (res) {
        var who = parse.sender(res.prefix);

        // remove nick from all channels
        this.channels.each(function (chan) {
            chan.del(who.nick);
        });
    },
    "PART": function (res) {
        var who = parse.sender(res.prefix);
        
        if (who.nick === this._opts.nick) {
            // remove channel from list
            delete this.channels[res.params];
            this.emit("partfrom", 
                    res.params,
                    res.args);
        } else {
            // remove user from channel
            this.channels[res.params].
                del(who.nick);
            this.emit("partin", 
                    who, 
                    res.params, 
                    res.args);
        }
    },
    "KICK": function (res) {
        var who = parse.sender(res.prefix);
        var params = res.params.split(" ");

        // either remove channel or nick
        if (params[1] === this._opts.nick) {
            delete this.channels[params[0]];
            this.emit("kickfrom", 
                    who,
                    params[0],
                    res.args);
        } else {
            this.channels[params[0]].
                del(params[1]);
            this.emit("kickin", 
                    who,
                    params[0],
                    params[1],
                    res.args);
        }
    },
    "JOIN": function (res) {
        var who = parse.sender(res.prefix);
        
        if (who.nick === this._opts.nick) {
            this.channels.add(res.params);
            this.log("added channel: "+res.params);
            this.emit("jointo", res.params);
        } else {
            this.channels[res.params].
                add(who.nick);
            this.emit("joinin", who, res.params);
        }
    },
    "MODE": function (res) {
        var who = parse.sender(res.prefix);

        var params = res.params.split(" ");
        if (params[0][0] === "#") {
            var chan = this.channels[params[0]];
            if (params[2]) {
                var nick = 
                    parse.sender(params[2]).nick;
                chan.mode(params[1],nick);
            } else {
                // TODO parse channel flags
            }
        } else {
            // TODO parse global user flags
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

    },
    "324": function (res) {
        var params = res.params.split(" ");
        var chan = this.channels[params[1]];
        chan._flags = params[2].replace("+","");
    },
    "329": function (res) {
        var params = res.params.split(" ");
        var chan = this.channels[params[1]];
        chan._creation = parseInt(params[2]);
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
    "005": function (res) {
        // TODO parse capabilites.
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
        var i = _line[3].indexOf(":");
        if (i >= 0) {
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
