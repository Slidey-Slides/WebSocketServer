import { WebSocketServer } from "ws";

import { message, close } from "./core/handler";

const PORT = 3000;
const wss = new WebSocketServer({ port: PORT });

console.log(`server started on port ${PORT}`);

wss.on("connection", function connection(ws) {
    console.log("New connection to socket");

    ws.on("message", (data) => message(ws, data));
    ws.on("close", () => close(ws));
});
