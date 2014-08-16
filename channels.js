var Channel = {
    // flags and nicks and timestamp 
    // TODO: getter & setter
    _created: 0,
    _flags: "",
    _nicks: {},
    // add nick(s)
    add: function (arg) {
        var nick = /^([@+]*)(.+)/;
        if (typeof arg === "string") {
            this._nicks[arg] = "";
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
    // delete nick
    del: function (arg) {
        delete this._nicks[arg];
    },
    // change a nickname
    change: function(from, to) {
        var old = this._nicks[from];
        delete this._nicks[from];
        this._nicks[to] = old;
    },
    // change mode of a nick
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
    }
}

var Channels = {
    add: function (name) {
        this[name] = Object.create(Channel);
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
module.exports = Channels;
