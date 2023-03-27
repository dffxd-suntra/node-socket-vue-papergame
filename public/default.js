let socket, serverGame;
let username, playerColor;
let game, board;
let usersOnline = [];
let myGames = [];
socket = io();

//////////////////////////////
// Socket.io handlers
////////////////////////////// 

// 登陆成功时
socket.on("login", function (msg) {
    localStorage.setItem();
    // 切换到大厅界面
    $("#page-login").hide();
    $("#page-lobby").show();

    $("#userLabel").text(username);

    usersOnline = msg.users;
    updateUserList();

    myGames = msg.games;
    updateGamesList();
});

// 有用户进入大厅
socket.on("joinlobby", function (msg) {
    addUser(msg);
});

// 有用户离开大厅
socket.on("leavelobby", function (msg) {
    removeUser(msg);
});

// 有新游戏
socket.on("gameadd", function (msg) {
});

// 结束游戏
socket.on("resign", function (msg) {
    if (msg.gameId == serverGame.id) {

        socket.emit("login", username);

        $("#page-lobby").show();
        $("#page-game").hide();
    }
});

// 加入游戏
socket.on("joingame", function (msg) {
    console.log("joined as game id: " + msg.game.id);
    playerColor = msg.color;
    initGame(msg.game);

    $("#page-lobby").hide();
    $("#page-game").show();

});

// 移动棋子
socket.on("move", function (msg) {
    if (serverGame && msg.gameId === serverGame.id) {
        game.move(msg.move);
        board.position(game.fen());
    }
});

// 有用户登出
socket.on("logout", function (msg) {
    removeUser(msg.username);
});



//////////////////////////////
// Menus
////////////////////////////// 

// 当点击登录按钮
$("#login").click(function () {
    let password_hash = md5($("#password").val());
    username = $("#username").val();

    username = username.trim();

    if (username.length == 0) {
        $("#login-warn").text("用户名不合法");
        return;
    }

    socket.emit("login", username, password_hash);
});

// 回到主页(不结束)
$("#game-back").click(function () {
    socket.emit("login", username);

    $("#page-game").hide();
    $("#page-lobby").show();
});

// 结束游戏
$("#game-resign").click(function () {
    socket.emit("resign", { userId: username, gameId: serverGame.id });

    socket.emit("login", username);
    $("#page-game").hide();
    $("#page-lobby").show();
});

function addUser(userId) {
    usersOnline.push(userId);
    updateUserList();
}

function removeUser(userId) {
    for (let i = 0; i < usersOnline.length; i++) {
        if (usersOnline[i] === userId) {
            usersOnline.splice(i, 1);
        }
    }
    updateUserList();
}

// 有关的
function updateGamesList() {
    $("#gamesList").html("");
    myGames.forEach(function (game) {
        $("#gamesList").append(
            $("<button>")
                .text("#" + game)
                .click(function () {
                    socket.emit("resumegame", game);
                })
        );
    });
}

function updateUserList() {
    $("#userList").html("");
    usersOnline.forEach(function (user) {
        $("#userList").append(
            $("<button>")
                .text(user)
                .click(function () {
                    socket.emit("invite", user);
                })
        );
    });
}

//////////////////////////////
// Chess Game
////////////////////////////// 

// 新游戏
function initGame(serverGameState) {
    serverGame = serverGameState;

    let cfg = {
        draggable: true,
        showNotation: false,
        orientation: playerColor,
        position: serverGame.board ? serverGame.board : "start",
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };

    game = (serverGame.board ? new Chess(serverGame.board) : new Chess());
    board = new ChessBoard("game-board", cfg);
}

// do not pick up pieces if the game is over
// only pick up pieces for the side to move
function onDragStart(source, piece, position, orientation) {
    if (game.game_over() === true ||
        (game.turn() === "w" && piece.search(/^b/) !== -1) ||
        (game.turn() === "b" && piece.search(/^w/) !== -1) ||
        (game.turn() !== playerColor[0])) {
        return false;
    }
}


// 正在下棋
function onDrop(source, target) {
    // see if the move is legal
    let move = game.move({
        from: source,
        to: target,
        promotion: "q" // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) {
        return "snapback";
    } else {
        socket.emit("move", {
            move: move,
            gameID: serverGame.id,
            board: game.fen()
        });
    }

}

// update the board position after the piece snap 
// for castling, en passant, pawn promotion
function onSnapEnd() {
    board.position(game.fen());
}

