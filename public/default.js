let socket = io();
let me = {};
let rooms = [];
let choosedRoom = null;

//////////////////////////////////////////
// 普通页面
///////////////////////////////

// 检测是否存储用户名密码
/* if (localStorage.getItem("username") != null) {
    localStorage.setItem("username", username);
    localStorage.setItem("password_hash", password_hash);
} */

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
    let roompassword = $("#roompassword").val();
    let roompassword_hash = md5(roompassword);
    let isPublic = $("#isPublic").prop("checked");

    let havePassword = (roompassword != "");

    socket.emit("creatNewRoom", { roomname, roompassword_hash, isPublic, havePassword }, function (roomInfo) {
        console.log(roomInfo);
    });
});

$("#join").click(function () {
    if (choosedRoom == null) {
        return;
    }
    let joinpassword_hash = md5($("#joinpassword").val());

    socket.emit("joinRoom", choosedRoom.id, joinpassword_hash, function (joinInfo) {
        if (joinInfo.status == "success") {
            history.pushState(null, "?room=" + choosedRoom.id);

            $("#page-join").removeClass("show");
            $("#page-join").css("display", "");

            $("#page-lobby").fadeOut(function () {
                ROOM.initRoom();
                $("#page-game").fadeIn();
            });
        }
        if (joinInfo.status == "fail") {
            $("#join-warn").text(joinInfo.message);
        }
    });
});

$("#leave").click(function () {
    socket.emit("leaveRoom", function () {
        ROOM.closeRoom();
        $("#page-game").fadeOut(function () {
            $("#page-lobby").fadeIn();
        });
    });
});


socket.on("doLogout", function () {
    console.log("out");
    $("#page-login").css("transform", "");
    me = {};
    if (ROOM.room != null) {
        ROOM.closeRoom();
    }
});

// 更新用户资料时
socket.on("updateUserInfo", function (userInfo) {
    me = userInfo;
    updateUserInfo();
});

socket.on("updateRoomList", function (roomList) {
    rooms = roomList;
    updateRoomList();
});

function updateUserInfo() {
    $("#userLabel").text(me.username);
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
                $(`<h3 onclick="joinRoom('${room.id}');">`)
                    .text(`${room.roomname} (roomId: ${room.id})` + (room.master.id == me.id ? "(你自己的)" : ""))
                    .append(room.havePassword ? `<i class="bi bi-lock-fill" style="float:right;"></i>` : "")
                    .append(room.isPublic ? "" : `<i class="bi bi-shield-shaded" style="float:right;"></i>`),
                $(`<p>`).text(`master: ${room.master.username} (userId: ${room.master.id})`),
            )
        );
    }
}

function joinRoom(roomId) {
    room = rooms.find(room => room.id == roomId);
    console.log(room);

    if (room.havePassword) {
        choosedRoom = room;
        $("#page-join").addClass("show");
        $("#page-join").css("display", "block");
    } else {
        socket.emit("joinRoom", room.id, md5(""), function (joinInfo) {
            if (joinInfo.status == "success") {
                history.pushState(null, "?room=" + room.id);

                $("#page-lobby").fadeOut(function () {
                    ROOM.initRoom();
                    $("#page-game").fadeIn();
                });
            }
        });
    }
}

////////////////////////////////////////////////////////////////////////////////
// 房间
//////////////////////////////////////////

const ROOM = { // 房间内信息转发 roomData
    room: null,
    localVideo: $("#localVideo"),
    rtcVideoContainer: $("#rtcVideoContainer"),
    localStream: new MediaStream(),
    iceServer: {
        iceServers: [
            {
                urls: ["stun:eu-turn4.xirsys.com"]
            },
            {
                username: "ml0jh0qMKZKd9P_9C0UIBY2G0nSQMCFBUXGlk6IXDJf8G2uiCymg9WwbEJTMwVeiAAAAAF2__hNSaW5vbGVl",
                credential: "4dd454a6-feee-11e9-b185-6adcafebbb45",
                urls: [
                    "turn:eu-turn4.xirsys.com:80?transport=udp",
                    "turn:eu-turn4.xirsys.com:3478?transport=tcp"
                ]
            }
        ]
    },
    peerList: {},
    async initRoom() {
        await this.getUserMedia();
        this.localVideo.get(0).srcObject = this.localStream;
    },
    closeRoom() {
        ROOM.room = null;
        this.distory();
        let tracks = this.localStream.getTracks();
        for (let i in tracks) {
            tracks[i].stop();
            this.localStream.removeTrack(tracks[i]);
        }
        $("#chatBox").html("");
    },
    userJoin(user) {
        console.log("userJoin", user);
        this.getPeerConnection(user);
    },
    userLeave(user) {
        console.log("userLeave", user);
        if (this.peerList[user.id] == undefined) {
            return;
        }
        this.removePeer(this.peerList[user.id]);
    },
    async getUserMedia(constraints = { audio: true, video: { width: 640, height: 480 } }) {
        //获取本地的媒体流，并绑定到一个video标签上输出
        let stream = await navigator.mediaDevices.getUserMedia(constraints)
            .catch(err => {
                console.error(err);
            });

        // 清除原有track
        let tracks = this.localStream.getTracks();
        for (let i in tracks) {
            tracks[i].stop();
            this.localStream.removeTrack(tracks[i]);
        }

        // 添加用户音视频track
        tracks = stream.getTracks();
        for (let i in tracks) {
            this.localStream.addTrack(tracks[i]);
        }

        return this.localStream;
    },
    getPeerConnection(user) {
        let peer = new RTCPeerConnection(this.iceServer);

        peer.account = user.id;
        this.peerList[user.id] = peer;

        peer.addStream(this.localStream);

        peer.onaddstream = (event) => {
            console.log('event-stream', event);

            let video = this.rtcVideoContainer.find("#rtcVideo-" + user.id);

            if (video.length == 0) {
                video = $("<video>");
                video.attr({
                    id: "rtcVideo-" + user.id,
                    autoplay: "autoplay"
                });
                this.rtcVideoContainer.append(video);
            }

            video.get(0).srcObject = event.stream;
        };

        peer.onicecandidate = (event) => {
            console.log('event.target.iceGatheringState', event.target.iceGatheringState);
            console.log('sendIce', event);
            if (event.candidate) {
                socket.emit("roomData", {
                    type: "candidate",
                    data: event.candidate
                }, [user.id]);
            }
        };

        peer.oniceconnectionstatechange = (evt) => {
            console.log('ICE connection state change: ' + evt.target.iceConnectionState);
            if (evt.target.iceConnectionState === "disconnected") { // 断开连接后移除对应video
                this.removePeer(peer);
            }
        };

        peer.onnegotiationneeded = (event) => {
            console.log(arguments);
            this.createOffer(peer, user);
        };
    },
    async createOffer(peer, user) { // 创建offer，发送本地session描述，发送offer
        let offer = await peer.createOffer({
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        });
        console.log('send-offer', offer);
        await peer.setLocalDescription(offer);
        socket.emit("roomData", {
            type: "offer",
            data: offer
        }, [user.id]);
    },
    async onOffer(info) { // 设置远端描述 发送Answer
        console.log("onOffer", info);
        await this.peerList[info.from]
            .setRemoteDescription(new RTCSessionDescription(info.data))
            .catch(function (err) {
                console.log('onOffer_ERR:', err);
            });
        this.createAnswer(info);
    },
    async createAnswer(info) { // 创建Answer， 设置本地描述， 发送Answer
        let answer = await this.peerList[info.from].createAnswer();
        console.log('send-answer', answer);
        await this.peerList[info.from].setLocalDescription(answer);
        socket.emit("roomData", {
            type: "answer",
            data: answer
        }, [info.from]);
    },
    async onAnswer(info) { // 收到Answer后 设置远端描述
        console.log("onAnswer", info);
        await this.peerList[info.from]
            .setRemoteDescription(new RTCSessionDescription(info.data))
            .catch(function (err) {
                console.log('onAnswer_ERR:', err);
            });
    },
    async onCandidate(info) { // 接收ICE候选，建立P2P连接
        console.log('onCandidate', info);
        if (!info.data.candidate) {
            return;
        }
        await this.peerList[info.from]
            .addIceCandidate(new RTCIceCandidate(info.data))
            .catch((err) => {
                console.log('onIceCandidate_ERR:', err);
            });
    },
    removePeer(peer) {
        console.log("removePeer", peer);
        this.peerList[peer.account].close();
        this.rtcVideoContainer.find("#rtcVideo-" + peer.account).remove();
        delete this.peerList[peer.account];
    },
    updateRoomInfo() {
        $("#roomName").text(this.room.roomname);

        $("#roomUserList").html(``);
        for (let i in this.room.users) {
            $("#roomUserList").append(
                $(`<div class="list-group-item">`).append(
                    $(`<h4>`).append(
                        $(`<span class="fw-bold fst-italic">`).text(this.room.users[i].username),
                        ` (id: ${this.room.users[i].id})`
                    )
                )
            );
        }
        
    },
    distory() {
        for (let i in this.peerList) {
            this.removePeer(this.peerList[i]);
        }
    }
};

socket.on("updateRoomInfo", function (roomInfo) {
    console.log(ROOM.room, roomInfo, me);
    if (ROOM.room == null) {
        ROOM.room = roomInfo;
        ROOM.updateRoomInfo();
        for (let i in ROOM.room.users) {
            if (ROOM.room.users[i].id == me.id) {
                continue;
            }
            ROOM.userJoin(ROOM.room.users[i]);
        }
        return;
    }
    let hashList = {};
    for (let i in ROOM.room.users) {
        if (ROOM.room.users[i].id == me.id) {
            continue;
        }
        hashList[ROOM.room.users[i].id] = "leave";
    }
    for (let i in roomInfo.users) {
        if (roomInfo.users[i].id == me.id) {
            continue;
        }
        if (hashList[roomInfo.users[i].id] == "leave") {
            delete hashList[roomInfo.users[i].id];
            continue;
        }
        hashList[roomInfo.users[i].id] = "join";
    }
    for (let i in hashList) {
        if (hashList[i] == "leave") {
            ROOM.userLeave(ROOM.room.users.find(user => user.id == i));
        } else {
            ROOM.userJoin(roomInfo.users.find(user => user.id == i));
        }
    }
    ROOM.room = roomInfo;
    ROOM.updateRoomInfo();
});

socket.on("roomData", function (info) {
    if (info.type == "offer") {
        ROOM.onOffer(info);
    }
    if (info.type == "answer") {
        ROOM.onAnswer(info);
    }
    if (info.type == "candidate") {
        ROOM.onCandidate(info);
    }
    if (info.type == "chat") {
        $("#chatBox").append(
            $(`<div class="list-group-item">`).append(
                $(`<p>`).append(
                    $(`<span class="fw-bold fst-italic">`).text(ROOM.room.users.find(user => user.id == info.from).username),
                    ` ${moment(info.data.time).format("LLLL")} (id: ${info.from})`
                ),
                $(`<p>`).text(info.data.message)
            )
        );
    }
    if (info.type == "chooseGame") { }
    if (info.type == "gameData") { }
});

$("#chat").click(function () {
    let message = $("#chatMessage").val();
    socket.emit("roomData", {
        type: "chat",
        data: {
            message,
            time: Date.now
        }
    })
});

///////////////////////
// others
///////////////////////////