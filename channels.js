// represents a channel
var Channel = function () {
    this.names = [];

    // add nick(s)
    this.add = function (arg) {
        if (typeof arg === "String") {
            this.names.append(arg);
        } else if (Array.isArray(arg)) {
            this.names = 
                this.names.concat(arg);
        }
    }
    
    // delete nick(s)
    this.del = function (arg) {
    }
};

module.exports = {
    add: function (name) {
        this[name] = new Channel();
    },
};
