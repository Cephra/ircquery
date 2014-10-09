// Channel object
var Channel = function (irc, name, rejoin) {
    var that = this;
    this.name = name;
    this.rejoin = rejoin;

    // flags and creation date
    var arrFlags = [];
    var dateCreation;

    // per mode nick list
    var listNicks = {};
    listNicks [""] = [];
    irc.supports.prefixmode.forEach(function (mode) {
        listNicks[mode] = [];
    });

    var nickAddInit = function (where, nick) {
        if (where !== name) { return; }

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
    irc.on("names", nickAddInit);

    var nickAdd = function (where, nick) {
        if (where !== name) { return; }
        listNicks[""].push(nick.nick);
    };
    irc.on("joinin", nickAdd);

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
        if (where !== name) { return; }

        // search list for nick and delete
        for (key in listNicks) {
            var i = listNicks[key].indexOf(nick);
            if (i != -1) {
                listNicks[key].splice(i,1);
            }
        }
    };
    irc.on("partin", nickDel);
    irc.on("kickin", nickDel);
    irc.on("quit", nickDel);

    var nickCh = function (from, to) {
        for (key in listNicks) {
            var i = listNicks[key].indexOf(from);
            listNicks[key][i] = to;
        }
    });
    irc.on("nick", nickCh);

    irc.on(name+":flags", function (flags, target) {
        var op = flags.slice(0,1);
        var flags = flags.slice(1).split("");
        flags.forEach(function (v) {
            if (op === "+") {
                arrFlags.push(v);
            } else {
                var i = arrFlags.indexOf(v);
                arrFlags.splice(i,1);
            }
        });
    });

    var chanRemove = function handler(where) {
        // TODO delete channel specific event handlers
    };


    //// channel creation date
    //irc.once(name+":created", function (when) {
    //    dateCreation = new Date(when*1000);
    //});

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
