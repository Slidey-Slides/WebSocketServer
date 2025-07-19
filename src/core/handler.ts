import { WebSocket, RawData } from "ws";

import { MessageValidator } from "./types";

const SEND_ANGLE_INTERVAL = 150;
const TIME_ANGLE_IS_VALID = 500; // like so basically how long the angle is considered the current angle of the phone

const rooms: {
    [code: number]: {
        presenter?: WebSocket;
        voices: Set<WebSocket>;
        controllers: Set<WebSocket>;
        controllerAngles: Map<
            WebSocket,
            { angle: number; lastUpdated: number }
        >;
    };
} = {};

function send(ws: WebSocket, payload: any) {
    try {
        ws.send(JSON.stringify(payload));
    } catch (e) {
        console.error("Failed to send message:", e);
    }
}

function sendAverageAngle(code: number) {
    const room = rooms[code];
    if (!room || !room.presenter) return;

    const now = Date.now();
    const recentAngles: number[] = [];

    for (const [_, { angle, lastUpdated }] of room.controllerAngles.entries()) {
        const dt = now - lastUpdated;
        if (dt < TIME_ANGLE_IS_VALID) {
            recentAngles.push(angle);
        }
    }

    if (recentAngles.length <= 0) {
        return;
    }

    const average =
        recentAngles.reduce((sum, a) => sum + a, 0) / recentAngles.length;

    send(room.presenter, {
        event: "motion",
        source: "server",
        angle: average,
    });

    console.log(`averaged angle ${average.toFixed(2)}°`);
}

export function message(ws: WebSocket, data: RawData) {
    let parsedJSON;
    try {
        parsedJSON = JSON.parse(data.toString());
    } catch (e) {
        return console.log("not proper json");
    }

    const parsed = MessageValidator.safeParse(parsedJSON);
    if (!parsed.success) {
        return console.log("not correct types for json data", parsed.error);
    }

    const msg = parsed.data;
    const code = msg.code;

    if (msg.event === "create" && msg.source === "presenter") {
        if (rooms[code]) {
            return send(ws, {
                event: "error",
                source: "server",
                message: "Room already exists",
            });
        }

        rooms[code] = {
            presenter: ws,
            controllers: new Set(),
            voices: new Set(),
            controllerAngles: new Map(),
        };

        console.log(`Room ${code} created`);

        setInterval(() => sendAverageAngle(code), SEND_ANGLE_INTERVAL);

        return send(ws, {
            event: "join",
            source: "server",
            status: "ok",
            message: "Room created",
        });
    }

    if (msg.event === "join") {
        const room = rooms[code];
        if (!room) {
            send(ws, {
                event: "error",
                source: "server",
                message: "Room does not exist",
            });
            return;
        }

        if (room.controllers.has(ws) || room.voices.has(ws)) {
            return send(ws, {
                event: "error",
                source: "server",
                message: "already in",
            });
        }

        switch (msg.source) {
            case "controller":
                room.controllers.add(ws);
                console.log(`controller joined room ${code}`);
                break;
            case "voice":
                room.voices.add(ws);
                console.log(`Voice assistant joined room ${code}`);
                break;
            default:
                send(ws, {
                    event: "error",
                    source: "server",
                    message: "Invalid client type",
                });
                return;
        }

        send(ws, {
            event: "join",
            source: "server",
            status: "ok",
            message: "Joined room",
        });
        return;
    }

    if (msg.event === "motion" && msg.source === "controller") {
        const room = rooms[code];
        if (room?.presenter) {
            // old way just send the angle to the prsenter directly
            // send(room.presenter, {
            //     event: "motion",
            //     source: "server",
            //     angle: msg.angle,
            // });
            // console.log(
            //     `motion sent from controller to presenter (angle: ${msg.angle})`
            // );

            room.controllerAngles.set(ws, {
                angle: msg.angle,
                lastUpdated: Date.now(),
            });
        }
        return;
    }

    if (msg.event === "command" && msg.source === "voice") {
        const room = rooms[code];
        if (room?.presenter) {
            send(room.presenter, {
                event: "command",
                source: "server",
                change: msg.change,
            });
            console.log(
                `voice command recived: ${msg.change} sent to presenter as well`
            );
        }
        return;
    }

    if (msg.event === "data" && msg.source === "presenter") {
        const room = rooms[code];
        if (room) {
            room.voices.forEach((v) =>
                send(v, {
                    event: "data",
                    source: "server",
                    slideNumber: msg.slideNumber,
                })
            );
            console.log(`presenter has changed slide to ${msg.slideNumber}`);
        }
        return;
    }
}

export function close(ws: WebSocket) {
    for (const [codeStr, room] of Object.entries(rooms)) {
        const code = Number(codeStr);

        if (room.presenter === ws) {
            delete rooms[code];
            console.log(`presenter left so room ${code} closed`);
            continue;
        }

        room.controllers.delete(ws);
        room.voices.delete(ws);

        const isEmpty =
            !room.presenter &&
            room.controllers.size === 0 &&
            room.voices.size === 0;

        if (isEmpty) {
            delete rooms[code];
            console.log(`the room is been ${code} removed`);
        }
    }
}
