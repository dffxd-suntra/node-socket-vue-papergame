let users = [];

let rooms = [];

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

function doLogout(user) {
    for (let i in user.sockets) {
        user.sockets[i].emit("dologout");
        user.sockets[i].disconnect(true);
        delete user.sockets[i];
    }
}

