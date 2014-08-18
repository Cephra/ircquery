var Channel = function (name, that) {
    this._that = that;
    this._name = name;

    this._nicks = {};
};
Channel.prototype = {
    // rejoin on kick
    rejoin: true,
    // nicklist functions
    add: function (arg) {
        var nick = /^([@+]*)(.+)/;
        if (typeof arg === "string") {
            this._nicks[arg] = []; 
        } else if (Array.isArray(arg)) {
            for (var x = 0; x < arg.length; x++) {
                var item = arg[x].match(nick);
                var modes = item[1]
                    .replace("@","o")
                    .replace("+","v")
                    .split("");
                this._nicks[item[2]] =
                    modes;
            }
        }
    },
    del: function (arg) {
        delete this._nicks[arg];
    },
    change: function(from, to) {
        var old = this._nicks[from];
        delete this._nicks[from];
        this._nicks[to] = old;
    },
    mode: function (what, who) {
        var mode = what.split("");
        var modes = this._nicks[who];
        var i = modes.indexOf(mode[1]);

        if (mode[0] === "+" && i === -1) {
            // add new mode and sort
            modes.push(mode[1]);
            modes.sort();
        } else if (i !== -1) {
            modes = modes.filter(function (v) {
                if (v !== mode[1])
                    return v;
            });
        }
        this._nicks[who] = modes;
    },
    purge: function () {
        this._nicks = {};
    },
    nicklist: function () {
        var list = [];
        for (nick in this._nicks) {
            var mode = this._nicks[nick][0];
            if (typeof mode === "string") {
                var chanmodes = 
                    this._that._caps.chanmodes;
                var i = 
                    chanmodes.mode.indexOf(mode);
                mode = mode.replace(
                        chanmodes.mode[i],
                        chanmodes.prefix[i]);
            } else { mode = ""; }
            list.push(mode+nick);
        }
        return list;
    },
    // irc functions
    say: function (msg) {
        this._that.say(this._name, msg);
        return this;
    },
    part: function (msg) {
        this._that.part(this._name, msg);
        return this;
    },
}

var Channels = {
    add: function (name, that) {
        this[name] = new Channel(name, that);
    },
    del: function (name) {
        delete this[name];
    },
    each: function (func) {
        for (var chan in this) {
            // filter out member functions
            if (typeof this[chan] === "function")
                continue;

            // execute callback with channel
            if (typeof func === "function")
                func(this[chan]);
        }
    },
    list: function () {
        return Object.getOwnPropertyNames(this);
    }
};
module.exports.Channels = Channels;
