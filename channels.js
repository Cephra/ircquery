var Channel = {
    // flags and nicks
    flags: "",
    names: {},
    // add nick(s)
    add: function (arg) {
        var nick = /^([@+]*)(.+)/;
        if (typeof arg === "string") {
            this.names[arg] = "";
        } else if (Array.isArray(arg)) {
            for (var x = 0; x < arg.length; x++) {
                var item = arg[x].match(nick);
                var modes = item[1]
                    .replace("@","o")
                    .replace("+","v");
                this.names[item[2]] =
                    modes;
            }
        }
    },
    // delete nick
    del: function (arg) {
        delete this.names[arg];
    },
    // change a nickname
    change: function(from, to) {
        var old = this.names[from];
        delete this.names[from];
        this.names[to] = old;
    },
    // change mode of a nick
    mode: function (who, what) {

    },
}

var Channels = {
    add: function (name) {
        this[name] = Object.create(Channel);
    },
};
module.exports = Channels;
