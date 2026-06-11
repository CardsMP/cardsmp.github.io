import type { Server } from "socket.io";
import type { Card } from "@shared/card";
import { GamePhase, PlayType } from "@shared/game";
import { PlayerStatus } from "@shared/player";
import { MAX_ROOM_PLAYERS, Room, RoomStatus } from "@shared/room";
import type { GameSocket } from "./index";
import {
	io,
	emitRoomList,
	MENU_ROOM,
	rooms,
	gameSockets,
	profiles,
} from "./index";

export function setupHandlers(socket: GameSocket): void {
	socket.on("ping", () => {
		socket.emit("pong");
	});

	socket.on("set-name", (name: string) => {
		const trimmedName = name.trim().slice(0, 20);
		socket.player.name = trimmedName;

		const profile = profiles.get(socket.player.id);
		if (profile) profile.name = trimmedName;

		const roomPlayer = socket.room?.players.get(socket.player.id);
		if (roomPlayer) roomPlayer.name = trimmedName;
	});

	socket.on("create-room", () => {
		const code = createRoom();
		if (!code) {
			socket.emit("error", "Room limit reached");
			return;
		}

		joinRoom(socket, io, code);

		emitRoomList();
	});

	socket.on("join-room", (code: string) => {
		joinRoom(socket, io, code.toUpperCase());
		emitRoomList();
	});

	socket.on("disconnect", () => {
		gameSockets.delete(socket.id);
		handlePlayerLeave(socket);
	});

	socket.on("start-room", () => {
		if (!socket.room || socket.room.status === RoomStatus.PLAYING) return;

		if (!socket.room.isHost(socket.player.id)) {
			socket.emit("error", "Only the host can start the game");
			return;
		}

		if (!socket.room.tryStartRoom()) {
			socket.emit("error", `Need 3 or 4 players to start`);
			return;
		}

		emitStartedRoom(socket.room);
	});

	socket.on("bet-landlord", (bet: number) => {
		if (
			!socket.room ||
			socket.room.status !== RoomStatus.PLAYING ||
			socket.room.game.phase !== GamePhase.BIDDING
		)
			return;

		if (socket.room.game.current.id !== socket.player.id) {
			socket.emit("error", "Not your turn");
			return;
		}

		const result = socket.room.game.betLandlord(bet);

		if (result === undefined) {
			socket.emit("error", "Invalid bet");
			return;
		}

		io.to(socket.room.code).emit("p-bet-landlord", bet);
		broadcastSystemChat(
			socket.room,
			`${socket.player.name || "A player"} ${
				bet > 0 ? `bet ${bet}` : "passed"
			}. Current bet is ${socket.room.game.bet}.`,
		);

		if (result) {
			const landlordId = socket.room.game.landlord?.id;
			io.to(socket.room.code).emit(
				"p-became-landlord",
				landlordId,
				socket.room.game.bottom,
			);
			socket.room.game.becomeLandlord();
		}
	});

	socket.on("play-cards", (cards: Card[]) => {
		if (
			!socket.room ||
			socket.room.status !== RoomStatus.PLAYING ||
			socket.room.game.phase !== GamePhase.PLAYING
		)
			return;

		if (socket.room.game.current.id !== socket.player.id) {
			socket.emit("error", "Not your turn");
			return;
		}

		const result = socket.room.game.playCards(cards);

		if (result === undefined) {
			socket.emit("error", "Cannot play these cards");
			return;
		}

		io.to(socket.room.code).emit("p-played-cards", cards);

		const lastPlay = socket.room.game.lastPlay;
		if (
			lastPlay?.type === PlayType.BOMB ||
			lastPlay?.type === PlayType.ROCKET
		) {
			socket.room.game.bet *= 2;
			io.to(socket.room.code).emit(
				"p-bet-landlord",
				socket.room.game.bet,
			);
			broadcastSystemChat(
				socket.room,
				`${socket.player.name || "A player"} played a bomb. Bet doubled to ${socket.room.game.bet}.`,
			);
		}

		if (result) {
			const isLandlord =
				socket.player.id === socket.room.game.landlord?.id;
			const reason = isLandlord
				? "Landlord victory!"
				: "Farmers victory!";

			io.to(socket.room.code).emit("ended-room", reason);
			socket.room.endRoom();
		}
	});

	socket.on("send-chat", (rawMessage: string) => {
		if (!socket.room || typeof rawMessage !== "string") return;

		const message = rawMessage.trim().slice(0, 200);
		if (!message) return;

		socket.room.chat.push(socket.player.id, message);
		io.to(socket.room.code).emit("p-sent-chat", socket.player.id, message);
	});
}

function broadcastSystemChat(room: Room, message: string): void {
	room.chat.push("server", message);
	io.to(room.code).emit("p-sent-chat", "server", message);
}

function emitStartedRoom(room: Room): void {
	for (const player of room.players.values()) {
		const playerSocket = [...gameSockets.values()].find(
			(s) => s.player.id === player.id,
		);

		if (playerSocket)
			playerSocket.emit(
				"started-room",
				room.game.serialize(player.index),
			);
	}
}

function createRoom(roomCode?: string): string | undefined {
	if (rooms.size >= 10_000) return;
	const code = roomCode || randomCode();
	const room = new Room(code);
	rooms.set(code, room);

	return code;
}

function joinRoom(socket: GameSocket, io: Server, code: string): void {
	const room = rooms.get(code);

	if (!room) {
		socket.emit("error", "Room not found");
		return;
	}

	socket.leave(MENU_ROOM);
	socket.join(code);
	socket.room = room;

	const playerInRoom = room.players.get(socket.player.id);
	if (playerInRoom) {
		socket.player.name = playerInRoom.name;
		playerInRoom.status = PlayerStatus.NOT_READY;
		socket.emit("joined-room", room.serialize(socket.player.index));
		socket
			.to(socket.room.code)
			.emit("p-set-status", socket.player.id, PlayerStatus.NOT_READY);
	} else {
		if (room.players.size >= MAX_ROOM_PLAYERS) {
			socket.emit("error", "Room is full");
			return;
		}

		socket.player.status = PlayerStatus.NOT_READY;
		room.addPlayer(socket.player);
		io.to(socket.room.code).emit(
			"p-joined-room",
			socket.player.id,
			socket.player.name,
		);
		socket.emit("joined-room", room.serialize(socket.player.index));
	}
}

function handlePlayerLeave(socket: GameSocket): void {
	const room = socket.room;
	if (!room) return;

	socket.leave(room.code);

	if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
	else handleGamePlayerDisconnect(socket, room);

	if (shouldDeleteRoom(room)) deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
	room.removePlayer(socket.player.id);
	socket.to(room.code).emit("p-left-room", socket.player.id);
	emitRoomList();
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
	const player = room.players.get(socket.player.id);
	if (player) {
		player.status = PlayerStatus.DISCONNECTED;
		socket
			.to(room.code)
			.emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
	}
}

function shouldDeleteRoom(room: Room): boolean {
	return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
	rooms.delete(roomCode);
	emitRoomList();
}

function randomCode(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	do {
		result = "";
		for (let index = 0; index < 4; index++)
			result += chars.charAt(Math.floor(Math.random() * chars.length));
	} while (rooms.has(result));

	return result;
}
