var res = function (line) {
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
    } else if (_line = line.match(re2)) {
        response.type = _line[1];
        response.args = _line[2];
    }

    return response;
};
var User = function (hoststring) {
    this.nick = hoststring;
    if (this.nick.indexOf("!") != -1) {
        var nicksplt = this.nick.split("!");
        var hostsplt = nicksplt[1].split("@");
        
        // set nick
        this.nick = nicksplt[0];

        // and user@host
        this.user = hostsplt[0];
        this.host = hostsplt[1];
    }
};
var parse = module.exports = {
    "PING": function (res) {
        this.cmd("PONG :"+res.args, true);
    },
    "251": function (res) {
        this._connected = true;

        // request multi prefix
        this.cmd("CAP REQ :multi-prefix", true);

        // login successful
        this.emit("login");
    },
    "NICK": function (res) {
        var who = new User(res.prefix);
        var to = res.args;

        // change nick in all channels
        this.channels.each(function (chan) {
            chan.change(who.nick, to);
        });
    },
    "QUIT": function (res) {
        var who = new User(res.prefix);

        // remove nick from all channels
        this.channels.each(function (chan) {
            chan.del(who.nick);
        })
        this.emit("quit", who, res.args);
    },
    "PART": function (res) {
        var who = new User(res.prefix);
        var where = res.params[0];
        
        if (who.nick === this._opts.nick) {
            // remove channel from list
            this.channels.del(where);
            this.emit("partfrom",
                    where,
                    res.args);
        } else {
            // remove user from channel
            this.channels[where].
                del(who.nick);
            this.emit("partin",
                    where, 
                    who, 
                    res.args);
        }
    },
    "KICK": function (res) {
        var who = new User(res.prefix);
        var where = res.params[0];

        // either remove channel or nick
        if (res.params[1] === this._opts.nick) {
            var chan = this.channels[where];
            if (chan.rejoin) {
                chan.purge();
                this.join(where, true);
            } else {
                this.channels(where);
            }
            this.emit("kickfrom",
                    where,
                    who,
                    res.args);
        } else {
            this.channels[where].
                del(res.params[1]);
            this.emit("kickin",
                    where, 
                    who,
                    res.params[1],
                    res.args);
        }
    },
    "JOIN": function (res) {
        var who = new User(res.prefix);
        var where = res.params[0];
        
        if (who.nick === this._opts.nick) {
            this.log("added channel: "+
                    res.params[0]);

            this.emit("jointo",where);
        } else {
            this.channels[where].
                add(who.nick);
            this.emit("joinin", where, who);
        }
    },
    "MODE": function (res) {
        var who = new User(res.prefix);

        if (res.params[0][0] === "#") {
            var chan = 
                this.channels[res.params[0]];
            if (res.params[2]) {
                // changed on who?
                var user = new User(res.params[2]);

                // list or nick mode?
                var whatmode = this.
                    _caps.prefix.mode
                    .indexOf(res.params[1][1]);

                // change either 
                // nick or list mode
                if (whatmode != -1) {
                    chan.mode(res.params[1], 
                            user.nick);
                } else {
                    this.log("list mode changed");
                }
            } else {
                this.log("channel mode changed");
            }
        } else {
            this.log("user mode changed");
        }
    },
    "353": function (res) {
        // where and who
        var chan = res.params[2];
        var names = res.args.split(" ");

        // pass name array to channel
        this.log("receiving names in "+chan);
        this.channels[chan].add(names);
    },
    "324": function (res) {
        var chan = this.channels[res.params[1]];
        if (typeof chan !== "undefined")
            chan._flags = 
                res.params[2].replace("+","");
    },
    "329": function (res) {
        var chan = this.channels[res.params[1]];
        if (typeof chan !== "undefined")
            chan._creation =
                parseInt(res.params[2]);
    },
    "NOTICE": function (res) {
        var who = new User(res.prefix);

        this.emit("notice",
                who,
                res.params,
                res.args);
    },
    "PRIVMSG": function (res) {
        var who = new User(res.prefix);
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
            if (match = v.match(/([A-Z]+)=(.*)/)) {
                var param = match[1];
                var value = match[2];
                switch (param) {
                case "CHANTYPES":
                    break;
                case "CHANMODES":
                    var modes = value.split(",");
                    this._caps.chanmodes = {
                        A: modes[0],
                        B: modes[1],
                        C: modes[2],
                        D: modes[3],
                    }
                    break;
                case "PREFIX":
                    var re = /\((.+)\)(.+)/;
                    var prefs = value.split(re);

                    this._caps.prefix = 
                        prefs[2].split("");
                    this._caps.prefix.mode = 
                        prefs[1].split("");
                    break;
                }
            }
        }, this);
    },
};

// export the submodules
module.exports.res = res;
module.exports.User = User;
