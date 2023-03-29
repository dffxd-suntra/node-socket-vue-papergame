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
            doLogout(user);
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

function doLogout(user) {
    user.socket.emit("doLogout");
    delete user.socket.userId;
    delete user.socket.roomId;
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
        users: {},
        reg_date: Date.now()
    };

    return rooms[id];
}

function updateUserInfo(user) {
    user.socket.emit("updateUserInfo", {
        id: user.id,
        username: user.username,
        reg_date: user.reg_date
    });
}

function updateRoomList() {
    let roomList = [];
    for (let i in rooms) {
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
        users[i].socket.emit("updateRoomList", roomList);
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
        updateRoomList();
    });

    socket.on("creatNewRoom", function (roomInfo, callback) {
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

        updateRoomList();
    });

    // 结束链接
    socket.on("disconnect", function (message) {
        console.log("链接取消", socket.handshake.address, socket.id);
        if (socket.userId == undefined) {
            return;
        }

        let user = findUser(socket.userId);
        doLogout(user);
    });
});

http.listen(config.port);

console.log(`server running on: http://127.0.0.1:${config.port}/`);