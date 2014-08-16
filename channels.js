var Channel = {
    // flags and nicks
    _flags: "",
    _names: {},
    // add nick(s)
    add: function (arg) {
        var nick = /^([@+]*)(.+)/;
        if (typeof arg === "string") {
            this._names[arg] = "";
        } else if (Array.isArray(arg)) {
            for (var x = 0; x < arg.length; x++) {
                var item = arg[x].match(nick);
                var modes = item[1]
                    .replace("@","o")
                    .replace("+","v");
                this._names[item[2]] =
                    modes;
            }
        }
    },
    // delete nick
    del: function (arg) {
        delete this._names[arg];
    },
    // change a nickname
    change: function(from, to) {
        var old = this._names[from];
        delete this._names[from];
        this._names[to] = old;
    },
    // change mode of a nick
    mode: function (what, who) {
        var mode = what.split("");
        var tmp = this._names[who].split("");
        var i = tmp.indexOf(mode[1]);

        if (mode[0] === "-" && i !== -1) {
            tmp[i] = "";
        } else if (mode[0] === "+" && i === -1) {
            tmp.push(mode[1]);
        }

        this._names[who] = tmp.sort().join("");
    },
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
