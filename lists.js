// Channel object
var Channel = function (irc, name, rejoin) {
    var that = this;
    this.name = name;
    this.rejoin = rejoin;

    listNicks = [];
    listModes = {};
    irc.supports.prefixmode.forEach(function (mode) {
        listModes[mode] = [];
    });

    this.nickAdd = function (nick) {
        var prefixes = irc.supports.modeprefix.join("");
        var prefixSplit = nick.match("(["+prefixes+"]*)(.*)");
        var split = {
            nick: prefixSplit[2],
            prefixes: prefixSplit[1].split(""),
        };
        if (split.prefixes.length > 0) {
            split.prefixes.forEach(function (prefix) {
                var i = irc.supports.modeprefix.indexOf(prefix);
                var mode = irc.supports.prefixmode[i]
                listModes[mode].push(prefixSplit[2]);
            });
        }
        listNicks.push(split[2]);
    };

    // send msg to this channel
    this.say = function (msg) {
        irc.say(that.name, msg);
    };
};

// Builds a ChannelQuery object
var Channels = function () {
    var that = this;
    var channels = [];

    // channel query function
    // TODO cache channel queries
    var query = function (name) {
        var channel;
        channels.every(function (v) {
            if (v.name === name) {
                channel = v;
                return false;
            }
            return true;
        });
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
    query.del = function (chan) {

    };
    // execute for each channel
    query.each = function (callback) {

    };

    // return the ChannelQuery
    return query;
};
module.exports.Channels = Channels;

var Users = function () {
    var users = [];

    var query = function (name) {
        var user;
        users.every(function (v) {
            if (v.name === name) {
                channel = v;
                return false;
            }
            return true;
        });
        return channel;
    }; 

    // return UserQuery
    return query;
};
module.exports.Users = Users;
