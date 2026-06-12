import express from "express";
import { setupHandlers } from "./handlers";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { Server, Socket } from "socket.io";
import { config } from "@shared/config";
import { Player } from "@shared/player";
import type { Room } from "@shared/room";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const httpServer = http.createServer(app);
export const io = new Server(httpServer, {
	cors: {
		origin: true,
		credentials: true,
	},
});
export const rooms = new Map<string, Room>();
export const profiles = new Map<string, Profile>();
export const gameSockets = new Map<string, GameSocket>();
export const MENU_ROOM = "*";

export class GameSocket extends Socket {
	room: Room | undefined;
	player!: Player;
}

export interface Profile {
	name: string;
	id: string;
	auth: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const devPublicPath = path.resolve(__dirname, "../../public");
const prodPublicPath = path.resolve(__dirname, "../public");
const publicPath = fs.existsSync(prodPublicPath)
	? prodPublicPath
	: devPublicPath;
const isDevelopment = publicPath === devPublicPath;
const sharedSrcPath = path.resolve(repoRoot, "shared/src");

// Setup Vite in dev, static serving in production
if (isDevelopment) {
	const { createServer } = await import("vite");
	const vite = await createServer({
		root: publicPath,
		resolve: {
			alias: {
				"@shared": sharedSrcPath,
			},
		},
		server: {
			middlewareMode: true,
			fs: {
				allow: [repoRoot],
			},
		},
		appType: "spa",
	});
	app.use(vite.middlewares);
} else {
	app.use("/cards", express.static(path.join(publicPath, "cards")));
	app.use("/img", express.static(path.join(publicPath, "img")));
	app.use(express.static(publicPath));
}

app.get("/games/:roomCode", (request, response) => {
	const roomCode = request.params.roomCode as string;
	if (!/^[A-Z0-9]{4}$/.test(roomCode))
		return response.status(404).send("Invalid room code format");
	response.sendFile("index.html", { root: publicPath });
});

io.on("connection", (socket: Socket) => {
	const gameSocket = socket as GameSocket;
	const handshakePlayerID = gameSocket.handshake.auth.playerID as
		| string
		| undefined;
	const handshakeToken = gameSocket.handshake.auth.token as
		| string
		| undefined;

	if (handshakePlayerID && handshakeToken) {
		const profile = profiles.get(handshakePlayerID);
		if (profile && profile.auth === handshakeToken) {
			gameSocket.player = new Player(handshakePlayerID, profile.name);
			gameSocket.emit("sent-player", profile.name);
		} else {
			issueFreshProfile(gameSocket);
		}
	} else {
		issueFreshProfile(gameSocket);
	}

	gameSockets.set(gameSocket.player.id, gameSocket);
	gameSocket.on("disconnect", () => {
		if (gameSockets.get(gameSocket.player.id) === gameSocket) {
			gameSockets.delete(gameSocket.player.id);
		}
	});
	gameSocket.join(MENU_ROOM);
	setupHandlers(gameSocket);
});

const PORT = Number(process.env.PORT) || config.serverPort;
httpServer.listen(PORT, () => {
	const startTime = Date.now();
	console.log(
		`<< Started Server [${PORT}] on ${new Date().toLocaleString()} >>\n`,
	);

	function writeStatus() {
		const secondsAgo = Math.floor((Date.now() - startTime) / 1000);
		console.log(
			`Uptime: ${secondsAgo}s | Rooms: ${rooms.size} | Players: ${profiles.size}`,
		);
	}
	writeStatus();
	setInterval(writeStatus, 5000);
});

function randomPlayerID(): string {
	return (
		Math.random().toString(36).slice(2, 15) +
		Math.random().toString(36).slice(2, 15)
	);
}

function randomAuth(): string {
	return randomBytes(32).toString("hex");
}

function issueFreshProfile(socket: GameSocket): void {
	const id = randomPlayerID();
	const auth = randomAuth();
	const player = new Player(id, "");

	socket.player = player;
	profiles.set(id, { name: "", id, auth });
	socket.emit("created-player", id, auth);
}
