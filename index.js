const WebSocket = require('ws');
const express = require("express");
const lore = require("./public/lore");
var app = express();
app.use(express.static("public"));
app.listen(8031);
const wss = new WebSocket.Server({ port: 3320 });

Array.prototype.shuffled = function () {
    return this.map(function (n) { return [Math.random(), n] })
        .sort().map(function (n) { return n[1] });
};
Array.prototype.sample = function (n) {
    let duplicate = this.map(i => i);
    let result = [];
    for (let i = 0; i < n; i++) result.push(duplicate.splice(Math.random() * duplicate.length, 1)[0]);
    return result;
};

let active_games = {
    /*
    room_id:{
        players: [ws],
        host: ws
    }   
    */
};

let round_clustering = [
    [1],// for testing
    [2],// for testing
    [3],// for testing
    [4],// for testing
    [2, 3],// for testing
    [3, 3],
    [3, 4],
    [4, 4],
    [3, 3, 3],
    [3, 3, 4],
    [3, 4, 4]
];


function guid(count = 6) {
    let pool = "1234567890qwertyuiopasdfghjklzxcvbnm";
    tguid = "";
    for (i = 0; i < count; i++) tguid += pool[Math.floor(Math.random() * pool.length)];
    return tguid;
}


function progressRoom(currentRoom, first) {
    if (first) {
        currentRoom.current_set = 0;
        currentRoom.current_round = 0;
        currentRoom.players.forEach(i => i.score = 0);
    } else if (currentRoom.current_round == 4 * currentRoom.player_sets.length - 1) {
        for (let i of currentRoom.players) {
            i.ws.send(JSON.stringify({
                state: "podium",
                player_scores: currentRoom.players.map(i => i.score),
                player_intel_scores: currentRoom.players.map(i => i.intel_score)
            }))
        }
        return;
    } else {
        currentRoom.current_set++;
        currentRoom.current_set %= currentRoom.player_sets.length;
        console.log(currentRoom.current_set);
        console.log(currentRoom.player_sets);
        currentRoom.current_round++;
    }
    currentRoom.bill_count = 0; // serves as ID for bills
    currentRoom.bill_agreements = 0;

    currentRoom.resolutions = lore.resolutions.sample(6);
    // hand out a random priority to everyone
    for (let i = 0; i < currentRoom.players.length; i++) {
        currentRoom.players[i].private_resolutions = currentRoom.resolutions.map((i, ii) => ii).shuffled();
        if (currentRoom.player_sets[currentRoom.current_set].indexOf(i) != -1) {
            let BP = Math.random();
            if (BP < 0.1 && currentRoom.current_set > 0) {
                currentRoom.players[i].bill_penalty = 1;
            } else if (BP < 0.7) {
                currentRoom.players[i].bill_penalty = -1;
            } else {
                currentRoom.players[i].bill_penalty = -2;
            }
        } else {
            currentRoom.players[i].tracking_target = currentRoom.player_sets[currentRoom.current_set].sample(1)[0];
        }
    }

    // transmit the state
    currentRoom.prestartTimeout = setTimeout(() => {
        for (let i of currentRoom.players) {
            i.ws.send(JSON.stringify({
                state: "begin_round",
                current_round: currentRoom.current_round,
                total_rounds: currentRoom.player_sets.length * 4,
                current_set: currentRoom.current_set,
                own_set: i.set,
                set_count: currentRoom.player_sets[i.set].length,
                bill_penalty: i.bill_penalty,
                resolutions: currentRoom.resolutions,
                private_resolutions: i.private_resolutions,
                tracking_target: i.tracking_target,
                all_scores: currentRoom.players.map(i => i.score)
            }))
        }
    }, 5000);
    currentRoom.billExpiryTimeout = setTimeout(() => {
        // bill was not passed,
        // deduct bill penalty from all active players
        currentRoom.players.forEach((player, ii) => {
            if (currentRoom.player_sets[currentRoom.current_set].indexOf(ii) != -1) {
                player.score += player.bill_penalty;
            } else {
                // rank their guess
                if (player.private_guess) {
                    player.intel_score += player.private_guess.reduce((p, i, ii) => {
                        if (ii == currentRoom.players[player.tracking_target].private_resolutions.indexOf(i)) p++;
                        return p;
                    }, 0);
                }
                delete player.private_guess;
            }
        })

        for (let i of currentRoom.player_sets[currentRoom.current_set]) {
            currentRoom.players[i].score += currentRoom.players[i].bill_penalty;
        }
        for (let i of currentRoom.players) {
            i.ws.send(JSON.stringify({
                state: "bill_failed",
                score: i.score,
                intel_score: i.intel_score
            }))
        }
        progressRoom(currentRoom);
    }, (3 * 60 + 5) * 1000);
}

wss.on('connection', function connection(ws) {
    let ws_data_obj = {};
    ws.on('message', function incoming(data) {
        data = JSON.parse(String(data));
        let currentRoom;
        if (ws_data_obj.room_id) currentRoom = active_games[ws_data_obj.room_id];
        switch (data.action) {
            case "enter_game":
                if (active_games[data.room_id]) {
                    if (active_games[data.room_id].players.length > 11) {
                        ws.send(JSON.stringify({
                            state: "too_many_players"
                        }));
                        return;
                    }
                    active_games[data.room_id].players.forEach(i => {
                        i.ws.send(JSON.stringify({
                            state: "new_player",
                            player_alias: active_games[data.room_id].player_order[active_games[data.room_id].players.length]
                        }))
                    })
                    active_games[data.room_id].host.send(
                        JSON.stringify({
                            state: "new_player",
                            player_alias: active_games[data.room_id].player_order[active_games[data.room_id].players.length]
                        })
                    )
                    active_games[data.room_id].players.push({
                        ws: ws,
                        intel_score: 0,
                        score: 0
                    });
                    ws_data_obj.room_id = data.room_id;
                    ws_data_obj.player_index = active_games[data.room_id].players.length - 1;
                    ws.send(JSON.stringify({
                        state: "waiting_room",
                        players: active_games[data.room_id].players.map((i, ii) => active_games[data.room_id].player_order[ii]),
                        player_alias: active_games[data.room_id].player_order[active_games[data.room_id].players.length - 1]
                    }));
                } else {
                    ws.send(JSON.stringify({
                        state: "invalid_room"
                    }))
                }
                break;
            case "host_game":
                let uid;
                while (!uid || active_games[uid]) uid = guid();
                active_games[uid] = {
                    player_order: lore.countries.sample(20).shuffled(),
                    players: [],
                    host: ws
                };
                ws_data_obj.room_id = uid;
                ws.send(JSON.stringify({
                    state: "created_room",
                    uid: uid
                }));
                break;
            case "start_game":
                //set up the rounds as per the players
                //shuffle players to get clustering
                let alt_order = currentRoom.players.map((i, ii) => ii).shuffled();
                currentRoom.player_sets = round_clustering[currentRoom.players.length - 1].map((i, ii) => {
                    let subset = alt_order.splice(0, i);
                    for (let i of subset) {
                        currentRoom.players[i].set = ii;
                    }
                    return subset;
                });

                for (let i of currentRoom.players) {
                    i.ws.send(JSON.stringify({
                        state: "start_game",
                        players: currentRoom.player_order.slice(0, currentRoom.players.length)
                    }))
                }
                currentRoom.host.send(
                    JSON.stringify({
                        state: "start_game",
                        players: currentRoom.player_order.slice(0, currentRoom.players.length)
                    })
                )

                progressRoom(currentRoom, true);
                // run the first cluster
                break;

            case "submit_bill":
                //broadcast the bill to everyone
                currentRoom.bill_count++;
                currentRoom.bill_agreements = 0;
                currentRoom.last_bill = data.bill;
                for (let i of currentRoom.players) {
                    i.ws.send(JSON.stringify({
                        state: "bill_post",
                        bill_id: currentRoom.bill_count,
                        bill: data.bill
                    }));
                }
                break;
            case "confirm_bill":
                //broadcast the bill confirmation to everyone
                if (data.bill_id == currentRoom.bill_count) {
                    currentRoom.bill_agreements++;
                    for (let i of currentRoom.players) {
                        i.ws.send(JSON.stringify({
                            state: "bill_confirmed",
                            bill_id: currentRoom.bill_count,
                            player_index: ws_data_obj.player_index
                        }));
                    }
                } else {
                    ws.send({
                        state: "bill_expired"
                    });
                }
                if (currentRoom.bill_agreements == currentRoom.player_sets[currentRoom.current_set].length) {
                    //all bills passed, calculate score and move on
                    clearTimeout(currentRoom.billExpiryTimeout);
                    console.log(currentRoom.last_bill);
                    currentRoom.players.forEach((player, ii) => {
                        if (currentRoom.player_sets[currentRoom.current_set].indexOf(ii) != -1) {
                            player.score += currentRoom.last_bill.reduce((p, i, ii) => {
                                if (player.private_resolutions.indexOf(i) >= ii && player.private_resolutions.indexOf(i) <= 3) {
                                    p++;
                                    console.log("yes, bc");
                                }
                                console.log(`${i} was ${player.private_resolutions.indexOf(i)} vs ${ii}`)
                                return p;
                            }, 0);
                        } else {
                            // rank their guess
                            if (player.private_guess) {
                                player.intel_score += player.private_guess.reduce((p, i, ii) => {
                                    if (ii == currentRoom.players[player.tracking_target].private_resolutions.indexOf(i)) p++;
                                    return p;
                                }, 0);
                                delete player.private_guess;
                            }
                        }
                    })
                    for (let i of currentRoom.players) {
                        i.ws.send(JSON.stringify({
                            state: "bill_passed",
                            score: i.score,
                            bill: currentRoom.last_bill,
                            intel_score: i.intel_score
                        }))
                    }
                    console.log("conf received");
                    console.log(currentRoom.players.map(i => i.score));
                    progressRoom(currentRoom);
                }
                // if all bills exist, cry.
                // confirm the currently presented bill (maybe put in a bill ID just in case)
                // if all n players confirm the bill, end the round
                break;
            case "submit_ranking":
                //player submits own ranking
                currentRoom.players[ws_data_obj.player_index].private_guess = data.guess;
                break;
            case "kick_player":
                //eject the player
                currentRoom.players[data.player].ws.close();
                break;
            //clear round timer(s)
            //reallocate sets
            // 
            //rearrange sets
            //restart round
        }
        ws.on("close", () => {
            let currentRoom;
            if (ws_data_obj.room_id) currentRoom = active_games[ws_data_obj.room_id];
            if (currentRoom) {
                if (currentRoom.host == ws) {
                    //kick everyone
                    currentRoom.players.forEach(i => {
                        i.ws.close();
                    })
                    return;
                }
                currentRoom.players.splice(ws_data_obj.player_index, 1);
                if (currentRoom.players.length == 0) {
                    currentRoom.host.close();
                    return;
                }
                currentRoom.player_order.splice(ws_data_obj.player_index, 1);
                for (let i of currentRoom.players) {
                    i.ws.send(JSON.stringify({
                        state: "player_disconnected",
                        leaver: ws_data_obj.player_index,
                        remaining: currentRoom.players.map((i, ii) => currentRoom.player_order[ii])
                    }))
                }
                currentRoom.host.send(JSON.stringify({
                    state: "player_disconnected",
                    player: ws_data_obj.player_index
                }))
                let alt_order = currentRoom.players.map((i, ii) => ii).shuffled();
                console.log(round_clustering[currentRoom.players.length - 1]);
                console.log(currentRoom.players.length - 1)
                currentRoom.player_sets = round_clustering[currentRoom.players.length - 1].map((i, ii) => {
                    let subset = alt_order.splice(0, i);
                    for (let i of subset) {
                        currentRoom.players[i].set = ii;
                    }
                    return subset;
                });
                clearTimeout(currentRoom.prestartTimeout);
                clearTimeout(currentRoom.billExpiryTimeout);
                currentRoom.current_set = 0;
                progressRoom(currentRoom);
            }
        })
    });
});
