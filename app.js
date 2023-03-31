// 引库
let uuid = require("uuid");
let fs = require("fs");
let help = require("./modules/help");

// 网页
let express = require("express");
let app = express();
app.use(express.static("public"));
app.use("/ajax", require("./router/ajax"));

// 初始化socket
let http = require("http").Server(app);
let io = require("socket.io")(http);

// 配置
const config = JSON.parse(fs.readFileSync("./config.json"));

let users = [];

let rooms = Object.create(null);

// 登录活动
function doLogin(socket, username, password_hash) {
    let user = findUser("username", username);

    if (user === false) {
        user = creatUser({ username, password_hash });
        user.socket = socket;
        socket.userId = user.id;
        return;
    }

    if (user.password_hash === password_hash) {
        if (user.socket != null) {
            doLogout(user.socket);
        }
        user.socket = socket;
        socket.userId = user.id;
        return;
    } else {
        throw new Error("密码错误!");
    }
}

function creatUser({ username, password_hash }, add = {}) {
    let id = users.length;
    users[id] = {
        id,
        status: "",
        games: {},
        username,
        password_hash,
        socket: null,
        reg_date: Date.now()
    };
    for (let i in add) {
        users[id][i] = add[i];
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

function doLogout(socket) {
    socket.emit("doLogout");
    // 离开房间
    if (socket.roomId != undefined) {
        let room = findRoom("id", socket.roomId);
        room.users.splice(room.users.findIndex(userId => userId == socket.userId), 1);
        updateRoomInfo(room);
    }
    let user = findUser("id", socket.userId);

    delete socket.userId;
    delete socket.roomId;
    user.socket = null;
}

function creatNewRoom(socket, { roomname, roompassword_hash, isPublic, havePassword }) {
    let id;
    do {
        id = help.generateHexID(5);
    } while (id in rooms);

    rooms[id] = {
        id,
        roomname,
        roompassword_hash,
        isPublic,
        havePassword,
        master: socket.userId,
        users: [],
        reg_date: Date.now()
    };

    return rooms[id];
}

function findRoom(key, value) {
    // 优化
    if (key == "id") {
        return rooms[value] || false;
    }
    // 遍历查找
    return rooms.find(room => room[key] == value) || false;
}

function updateUserInfo(user) {
    user.socket.emit("updateUserInfo", {
        id: user.id,
        username: user.username,
        reg_date: user.reg_date
    });
}

function updateRoomList(userId) {
    let roomList = [];
    for (let i in rooms) {
        if (!rooms[i].isPublic && rooms[i].master != userId) {
            continue;
        }
        let room = {};
        room.id = rooms[i].id;
        room.roomname = rooms[i].roomname;
        room.isPublic = rooms[i].isPublic;
        room.havePassword = rooms[i].havePassword;
        room.reg_date = rooms[i].reg_date;

        let user = findUser("id", rooms[i].master);

        room.master = {
            id: user.id,
            username: user.username,
            reg_date: user.reg_date
        };
        roomList.push(room);
    }

    for (let i in users) {
        if (users[i].socket == null) {
            continue;
        }
        users[i].socket.emit("updateRoomList", roomList);
    }
}

function updateRoomInfo(room) {
    let roomInfo = {};

    roomInfo.id = room.id;
    roomInfo.roomname = room.roomname;
    roomInfo.isPublic = room.isPublic;
    roomInfo.havePassword = room.havePassword;
    roomInfo.reg_date = room.reg_date;

    let user = findUser("id", room.master);

    roomInfo.master = {
        id: user.id,
        username: user.username,
        reg_date: user.reg_date
    };

    roomInfo.users = [];
    for (let i in room.users) {
        let user = findUser("id", room.users[i]);

        roomInfo.users.push({
            id: user.id,
            username: user.username,
            reg_date: user.reg_date
        });
    }

    for (let i in room.users) {
        let user = findUser("id", room.users[i]);
        user.socket.emit("updateRoomInfo", roomInfo);
    }
}

io.on("connection", function (socket) {
    console.log("新链接者", socket.handshake.address, socket.id);

    socket.on("doLogin", function (username, password_hash, callback) {
        if (socket.userId == undefined) {
            try {
                doLogin(socket, username, password_hash);
            } catch (message) {
                callback({ status: "fail", message });
                console.log(message);
                return;
            };
        }

        callback({ status: "success" });

        let user = findUser("id", socket.userId);

        updateUserInfo(user);
        updateRoomList(socket.userId);
    });

    // 结束链接
    socket.on("doLogout", function () {
        if (socket.userId == undefined) {
            return;
        }

        doLogout(socket);
    });

    socket.on("creatNewRoom", function (roomInfo, callback) {
        if (socket.userId == undefined) {
            return;
        }

        let room;
        try {
            room = creatNewRoom(socket, roomInfo);
        } catch (message) {
            callback({ status: "fail", message });
            console.log(message);
            return;
        };

        roomInfo.id = room.id;
        callback({
            status: "success",
            info: {
                id: room.id,
                roomname: room.roomname,
                isPublic: room.isPublic,
                havePassword: room.havePassword,
                reg_date: room.reg_date
            }
        });

        updateRoomList(socket.userId);
    });

    socket.on("joinRoom", function (roomId, joinpassword_hash, callback) { // 加入房间
        if (socket.userId == undefined) {
            return;
        }

        let room = findRoom("id", roomId);

        if (room.roompassword_hash == joinpassword_hash) {
            room.users.push(socket.userId);
            socket.roomId = roomId;
            callback({ status: "success" });
            updateRoomInfo(room);
        } else {
            callback({ status: "fail", message: "密码错误" });
        }
    });

    socket.on("leaveRoom", function (callback) { // 离开房间
        if (socket.userId == undefined || socket.roomId == undefined) {
            return;
        }
        let room = findRoom("id", socket.roomId);

        callback();

        room.users.splice(room.users.findIndex(userId => userId == socket.userId), 1);

        updateRoomInfo(room);
    });

    socket.on("roomData", function (info, to = null) { // 房间内数据转发包括游戏之间的通讯,聊天,视频通话等(因而导致漏洞百出)
        if (socket.userId == undefined || socket.roomId == undefined) {
            return;
        }
        let room = findRoom("id", socket.roomId);

        to = to || room.users;

        for (let i in to) {
            if (!room.users.includes(to[i])) {
                continue;
            }
            let user = findUser("id", to[i]);
            user.socket.emit("roomData", info);
        }
    });

    // 结束链接
    socket.on("disconnect", function (message) {
        console.log("链接取消", socket.handshake.address, socket.id);
        if (socket.userId == undefined) {
            return;
        }

        doLogout(socket);
    });
});

http.listen(config.port);

console.log(`
服务器启动成功
服务器运行在: http://127.0.0.1:${config.port}/
`);