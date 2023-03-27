// 引库
let uuid = require("uuid");
let fs = require("fs");

// 网页
let express = require("express");
let app = express();
app.use(express.static("public"));

// 初始化socket
let http = require("http").Server(app);
let io = require("socket.io")(http);

// 配置
let port = process.env.PORT || 3000;

const DATA = {};

// 所有用户
let users = DATA.users = [];
// 大堂用户
let lobbyUsers = {};
// 所有游戏
let games = DATA.games = {};
// 活跃的游戏
let activeGames = DATA.activeGames = {};
// 开启debug
let debug = false;

function argumentsToArray(arg) {
    let t = [];
    for (let i = 0; i < arg.length; i++) {
        t[i] = arg[i];
    }
    return t;
}

function userEmit() {
    let user = argumentsToArray(arguments).shift();

    for (let i in user.sockets) {
        user.sockets.emit.apply(null, arguments);
    }
}

// 登录活动
function doLogin(socket, username, password_hash) {
    let user = findUser("username", username);

    if (user === false) {
        user = creatUser({ username, password_hash });
        user.sockets[socket.id] = socket;
        return user;
    }

    if (user.password_hash === password_hash) {
        user.sockets[socket.id] = socket;
        return user;
    }

    return false;
}

function creatUser(data = {}) {
    let id = users.length;
    users[id] = { id: id, sockets: {}, status: "", games: {} };
    for (let i in data) {
        users[id][i] = data[i];
    }
    return users[id];
}

function findUser(key, value) {
    // 优化
    if (key == "id") {
        return users[value] || false;
    }
    // 遍历查找
    return users.find(user => user[key] == value) || false;
}

function isOnline(user) {
    return Object.keys(user.sockets).length != 0;
}

function getGames() { }

function getUsers() { }

function doLogout(user) {
    for (let i in user.sockets) {
        user.sockets[i].emit("dologout");
        user.sockets[i].disconnect(true);
        delete user.sockets[i];
    }

    Object.values(user.sockets)[0].broadcast.emit("logout", user.id);
}

function joinLobby(user) {
    lobbyUsers[user.id] = user;

    Object.values(user.sockets)[0].broadcast.emit("joinlobby", { id: user.id, name: user.username });
}

function leaveLobby(user) {
    delete lobbyUsers[user.id];

    Object.values(user.sockets)[0].broadcast.emit("leavelobby", user.id);
}

function creatGame(user, { type = "", public = true }) {
    // 初始化比赛
    let game = {
        type: type,
        status: "",
        board: null,
        public: public,
        waiting: {},
        history: [],
        users: {}
    };

    // uuid4重复的概率很小,但是架不住运气啊
    do {
        game.id = uuid.v4();
    } while (game.id in games);

    games[game.id] = activeGames[game.id] = game;

    leaveLobby(game, user);
    joinGame(game, user, { type: "master" });

    return game;
}

function resignGame(game) {
    for (let i in game.waiting) {
        if (game.waiting[i].type == "invite") {
            rejectInvite(game, game.waiting[i].user);
        }
        if (game.waiting[i].type == "join") {
            rejectJoinGame(game, game.waiting[i].user);
        }
    }
    for (let i in game.users) {
        leaveGame(game, game.users[i]);
    }
    delete activeGames[game.id];
}

function findGame(key, value) {
    if (key == "id") {
        return games[value] || false;
    }
    return Object.values(games).find(game => game[key] == value) || false;
}

function joinGame(game, user, { type = "gamer" }) {
    game.users[user.id] = { user, type: type };

    user.games[game.id] = game;

    for (let i in game.users) {
        userEmit(game.users[i], "joingame", { game: game, color: "white" });
    }
}

function leaveGame(game, user) {
    delete user.games[game.id];
    delete game.users[user.id];

    for (let i in game.users) {
        userEmit(game.users[i], "leavegame");
    }
}

function inviteToJoinGame(game, user) {
    game.waiting[user.id] = {
        type: "invite",
        user: user
    };

    userEmit(user, "invitetojoingame", game);
}

function agreeInvite(game, user) {
    delete game.waiting[user.id];
    game.users[user.id] = user;

    userEmit(user, "agreeinvite", game);
}

function rejectInvite(game, user) {
    delete game.waiting[user.id];

    userEmit(user, "rejectinvite", game);
}

function applyToJoinGame(game, user) {
    game.waiting[user.id] = {
        type: "join",
        user: user
    };

    userEmit(user, "applytojoingame", game);
}

function agreeJoinGame(game, user) {
    delete game.waiting[user.id];
    game.users[user.id] = user;

    userEmit(user, "agreejoingame", game);
}

function rejectJoinGame(game, user) {
    delete game.waiting[user.id];

    userEmit(user, "rejectjoingame", game);
}


// 新接入用户
io.on("connection", function (socket) {
    // 用户
    let user = null;

    // 显示
    console.log("新玩家: " + socket.handshake.address);

    // 自定义
    socket.userEmit = function () {
        for (let i in user.sockets) {
            user.sockets[i].emit.apply(null, arguments);
        }
    };

    // 登录
    socket.on("login", function (username, password_hash) {
        user = doLogin(socket, username, password_hash);

        if (user === false) {
            socket.emit("loginfail");
            return;
        }

        joinLobby(user);

        socket.userID = user.id;

        // 登录/注册成功
        socket.emit("login", {
            users: getUsers(),
            games: getGames()
        });
    });

    // 登出
    socket.on("logout", function () {
        doLogout(user);
    });

    // 创建游戏
    socket.on("creatgame", function (info) {
        let game = creatGame(user);
        socket.broadcast.emit("creatgame", game);
    });

    // 申请加入游戏
    socket.on("applytojoingame", function (gameID) {
        let game = findGame("id", gameID);
        applyToJoinGame(game, user);
    });

    // 回复申请加入游戏
    socket.on("respondjoingame", function (gameID, guestID, status) {
        let game = findGame("id", gameID);
        let guest = findUser("id", guestID);
        if (status) {
            agreeJoinGame(game, guest);
        } else {
            rejectJoinGame(game, guest);
        }
    });

    // 离开游戏
    socket.on("leavegame", function (gameID) {
        let game = findGame("id", gameID);
        leaveGame(game, user);
    });

    // 邀请别人
    socket.on("invitetojoingame", function (gameID, guestID) {
        // 获取用户信息
        let game = findGame("id", gameID);
        let guest = findUser("id", guestID);
        inviteToJoinGame(game, guest);
    });

    // 回应邀请
    socket.on("respondinvite", function (gameID, guestID, status) {
        let game = findGame("id", gameID);
        let guest = findUser("id", guestID);
        if (status) {
            agreeInvite(game, guest);
        } else {
            rejectInvite(game, guest);
        }
    });

    // 移动
    socket.on("move", function (msg) {
        let game = games[msg.gameID];
        game.board = msg.board;
        game.history.push(msg.move);

        for (let i in game.users) {
            game.users[i].user.socket.emit("move", msg);
        }
    });

    // 结束游戏
    socket.on("resigngame", function (gameID, reason) {
        let game = findGame("id", gameID);
        resignGame(game);
        socket.broadcast.emit("resigngame", reason);
    });

    // 结束链接
    socket.on("disconnect", function (msg) {
        if (user === null) {
            return;
        }

        delete user.sockets[socket.id];

        console.log(user.username, socket.handshake.address, msg, isOnline(user));
    });
});

// 监听端口
http.listen(port, function () {
    console.log(`listening on http://127.0.0.1:${port}/`);
});