let socket = io();
let user = {};
let rooms = [];

socket.on("doLogout", function () {
    console.log("out");
    $("#page-login").css("transform", "");
    user = {};
});

// 更新用户资料时
socket.on("updateUserInfo", function (userInfo) {
    user = userInfo;
    updateUserInfo();
});

socket.on("updateRoomList", function (roomList) {
    rooms = roomList;
    updateRoomList();
});

function updateUserInfo() {
    $("#userLabel").text(user.username);
}

function updateRoomList() {
    if (rooms.length == 0) {
        $("#roomList").html("");
        $("#roomList").text("没有开放的房间");
        return;
    }

    rooms.sort(function (x, y) {
        return x.reg_date > y.reg_date;
    });
    console.log(rooms);

    $("#roomList").html("");
    for (let i in rooms) {
        let room = rooms[i];
        $("#roomList").append(
            $(`<li class="list-group-item">`).append(
                $(`<h3>`).text(room.roomname)
            )
        );
    }
}

// 当点击登录按钮
$("#login").click(function () {
    let password_hash = md5($("#password").val());
    let username = $("#username").val();

    // 有前后空格或者长度为0是违法用户名
    if (username != username.trim() || username.length == 0) {
        $("#login-warn").text("用户名不合法");
        return;
    }

    /* if ($("#rememberme").prop("checked")) {
        localStorage.setItem("username", username);
        localStorage.setItem("password_hash", password_hash);
    } */

    socket.emit("doLogin", username, password_hash, function (response) {
        console.log(response);
        if (response.status == "success") {
            // 切换到大厅界面
            $("#page-login").css("transform", "translateY(-100%)");
        }
        if (response.status == "fail") {
            $("#login-warn").text(response.message);
        }
    });
});

$("#creatNewRoom").click(function () {
    let roomname = $("#roomname").val();
    let roompassword_hash = md5($("#roompassword").val());
    let isPublic = $("#isPublic").prop("checked");

    let havePassword = (roompassword == "");

    socket.emit("creatNewRoom", { roomname, roompassword_hash, isPublic, havePassword }, function (roomInfo) {
        console.log(roomInfo);
    });
});

// 检测是否存储用户名密码
/* if (localStorage.getItem("username") != null) {
    localStorage.setItem("username", username);
    localStorage.setItem("password_hash", password_hash);
} */

$("#username").val("114514");
$("#password").val("1919810");
$("#login").click();