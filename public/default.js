let socket = io();
let user = {};
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
            ROOM.room = choosedRoom;
            history.pushState(null, "?room=" + roomNow.id);

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
        $("#page-game").fadeOut(function () {
            $("#page-lobby").fadeIn();
        });
    });
});


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
                $(`<h3 onclick="joinRoom('${room.id}');">`)
                    .text(`${room.roomname} (roomId: ${room.id})` + (room.master.id == user.id ? "(你自己的)" : ""))
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
                ROOM.room = room;
                history.pushState(null, "?room=" + roomNow.id);

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
    iceServer: {
        "iceServers": [
            {
                "url": "stun:stun.l.google.com:19302"
            }
        ]
    },
    peerList: {},
    initRoom() {
        getUserMedia();
    },
    closeRoom() { },
    userJoin() { },
    userLeave() { },
    getUserMedia(constraints = { audio: true, video: { width: 640, height: 480 } }) {
        //获取本地的媒体流，并绑定到一个video标签上输出
        return new Promise((resolve, reject) => {
            navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    this.localStream = stream;

                    this.localVideo.get(0).srcObject = stream;

                    resolve(stream);
                })
                .catch(err => {
                    console.error(err.name + ': ' + err.message);
                    reject(err);
                });
        });
    },
    getPeerConnection(newUser) {
        let account = [newUser.id, user.id].sort().join("-");

        let peer = new RTCPeerConnection(this.iceServer);

        peer.addStream(this.localStream);

        peer.onaddstream = (event) => {
            console.log('event-stream', event);

            let video = this.rtcVideoContainer.find("#rtcVideo-" + account);

            if (video.length == 0) {
                video = $("<video>");
                video.attr({
                    id: "#rtcVideo-" + account,
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
                    data: event.candidate,
                    account: account
                }, [newUser.id]);
            }
        };

        peer.oniceconnectionstatechange = (evt) => {
            console.log('ICE connection state change: ' + evt.target.iceConnectionState);
            if (evt.target.iceConnectionState === 'disconnected') { // 断开连接后移除对应video
                this.removePeer(peer);
            }
        };

        peer.account = account;
        this.peerList[account] = peer;

        if (user.id < newUser.id) {
            this.createOffer(peer);
        }
    },
    createOffer(peer) { // 创建offer，发送本地session描述，发送offer
        peer.createOffer({
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        }).then((desc) => {
            // console.log('send-offer', desc);
            peer.setLocalDescription(desc, () => {
                socket.emit("roomData", {
                    type: "offer",
                    data: peer.localDescription,
                    account: peer.account
                }, [newUser.id]);
            });
        });
    },
    onOffer(info) { // 设置远端描述 发送Answer
        console.log("onOffer", info.data);
        this.peerList[info.account].setRemoteDescription(info.data.sdp, () => {
            this.createAnswer(info);
        }, (err) => {
            console.log('onOffer_ERR:', err);
        });
    },
    createAnswer(info) { // 创建Answer， 设置本地描述， 发送Answer
        this.peerList[info.account]
            .createAnswer()
            .then((desc) => {
                // console.log('send-answer', desc);
                this.peerList[info.account].setLocalDescription(desc, () => {
                    socket.emit("roomData", {
                        type: "answer",
                        data: this.peerList[info.account].localDescription,
                        account: account
                    }, [newUser.id]);
                });
            });
    },
    onAnswer(info) { // 收到Answer后 设置远端描述
        console.log('onAnswer', v);
        this.peerList[info.account].setRemoteDescription(info.data.sdp, function () { }, (err) => {
            console.log('onAnswer_ERR:', err);
        });
    },
    onCandidate(info) { // 接收ICE候选，建立P2P连接
        // console.log('onCandidate', v);
        if (info.data.candidate) {
            this.peerList[info.account].addIceCandidate(info.data.candidate).catch((err) => {
                console.log('onIceCandidate_ERR:', err);
            });
        }
    },
    removePeer(peer) {
        $("#rtcVideo-" + peer.account).remove();
        this.peerList[peer.account].close();
        delete this.peerList[peer.account];
    },
    distory() {
        for (let i in this.peerList) {
            removePeer(this.peerList[i]);
        }
    }
};

socket.on("updateRoomInfo", function (roomInfo) {
    for (let i in roomInfo.users) {
        
    }
});

socket.on("roomData", function (info) {
    if (info.type == "offer") {
        ROOM.onOffer(info);
    }
    if (info.type == "answer") {
        ROOM.onAnswer(info);
    }
});

///////////////////////
// others
///////////////////////////