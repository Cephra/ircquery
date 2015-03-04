module.exports.Users = function () {
  var that = this;
  var users = {};
  var userChans = {};

  var createUser = function (nick) {
    var user = {
      tell: function (msg) {
        that.say(nick, msg);
        return user;
      },
      kickFrom: function (chan, msg) {
        that.cmd("KICK "+nick+" "+chan+" :"+msg);
      },
      getChans: function () {
        return userChans[nick];
      },
    };
    return user;
  };

  var addUser = function (nick) {
    if (users[nick] !== undefined) {
      return;
    }

    users[nick] = createUser(nick);
  };
  var delUser = function (nick) {
    delete users[nick];
  };

  this.on("names", function (e) {
    e.nicks().forEach(function (nick) {
      addUser(nick);

      userChans[nick] = userChans[nick] || []; 
      userChans[nick].push(e.chan());
    });
  });
  this.on("quit", function (e) {
    var nick = e.user().nick();
    delUser(nick);
    delete userChans[nick];
  });

  return function (str) {
    for (var usr in users) {
      if (usr === str) {
        return users[usr];
      }
    }
  };
};

