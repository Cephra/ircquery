// represents a channel
var Channel = function () {
    this.names = {}; 

    // add nick(s)
    this.add = function (arg) {
        if (typeof arg === "string") {
            this.names.push(arg);
        } else if (Array.isArray(arg)) {
            this.names = 
                this.names.concat(arg);
        }
        this.names.sort();
    };
    
    // delete nick
    this.del = function (arg) {
        var test = /^[@+]+(.*)$/;
        this.names = 
            this.names.filter(function (elem) {
                if (elem.match(test)[1] !== arg)
                    return elem;
            });
    }

    // change a nickname
    this.change = function(arg) {

    }
};

module.exports = {
    add: function (name) {
        this[name] = new Channel();
    },
};
