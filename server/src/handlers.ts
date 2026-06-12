import type { Server } from "socket.io";
import { cardToString, type Card } from "@shared/card";
import { GamePhase, PlayType } from "@shared/game";
import { PlayerStatus } from "@shared/player";
import { MAX_ROOM_PLAYERS, Room, RoomStatus } from "@shared/room";
import type { GameSocket } from "./index";
import { io, MENU_ROOM, rooms, gameSockets, profiles } from "./index";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;
const MAX_PLAY_CARDS = 40;
const DISCONNECT_GRACE_MS = 15_000;
const pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>();

export function setupHandlers(socket: GameSocket): void {
	socket.on("ping", () => {
		socket.emit("pong");
	});

	socket.on("set-name", (name: unknown) => {
		const trimmedName = normalizeName(name);
		if (trimmedName === undefined) return;

		socket.player.name = trimmedName;

		const profile = profiles.get(socket.player.id);
		if (profile) {
			profile.name = trimmedName;
			profile.lastSeen = Date.now();
		}

		const roomPlayer = socket.room?.players.get(socket.player.id);
		if (roomPlayer) roomPlayer.name = trimmedName;
	});

	socket.on("create-room", () => {
		if (isRateLimited(socket, "create-room", 5, 60_000)) {
			socket.emit("error", "Too many rooms created. Please wait.");
			return;
		}

		const code = createRoom();
		if (!code) {
			socket.emit("error", "Room limit reached");
			return;
		}

		joinRoom(socket, io, code);
	});

	socket.on("join-room", (code: unknown) => {
		const roomCode = normalizeRoomCode(code);
		if (!roomCode) {
			socket.emit("error", "Invalid room code");
			return;
		}

		joinRoom(socket, io, roomCode);
	});

	socket.on("disconnect", () => {
		handlePlayerLeave(socket);
	});

	socket.on("reset-room", () => {
		if (
			!socket.room ||
			socket.room.game.phase !== GamePhase.FINISHED ||
			socket.room.status !== RoomStatus.LOBBY
		)
			return;

		if (!socket.room.tryStartRoom()) {
			socket.emit("error", "Need 3 or 4 players");
			return;
		}

		broadcastSystemChat(socket.room, "Round reset.");
		emitStartedRoom(socket.room);
	});

	socket.on("bet-landlord", (rawBet: unknown) => {
		if (
			!socket.room ||
			socket.room.status !== RoomStatus.PLAYING ||
			socket.room.game.phase !== GamePhase.BIDDING
		)
			return;

		const bet = normalizeBet(rawBet);
		if (bet === undefined) {
			socket.emit("error", "Invalid bet");
			return;
		}

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
			const bottom = [...socket.room.game.bottom];
			socket.room.game.becomeLandlord(bottom);
			const landlordHandCount =
				socket.room.game.landlord?.hand.cards.length ?? bottom.length;
			broadcastSystemChat(
				socket.room,
				`Bottom cards: ${formatCards(bottom)}.`,
			);
			io.to(socket.room.code).emit(
				"p-became-landlord",
				landlordId,
				landlordHandCount,
			);
			if (landlordId) {
				const landlordSocket = [...gameSockets.values()].find(
					(s) => s.player.id === landlordId,
				);
				if (landlordSocket)
					landlordSocket.emit("p-landlord-bottom", bottom);
			}
		}
	});

	socket.on("play-cards", (rawCards: unknown) => {
		if (
			!socket.room ||
			socket.room.status !== RoomStatus.PLAYING ||
			socket.room.game.phase !== GamePhase.PLAYING
		)
			return;

		const cards = normalizeCards(rawCards);
		if (!cards) {
			socket.emit("error", "Invalid cards");
			return;
		}

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
			lastPlay?.type === PlayType.ROCKET ||
			lastPlay?.type === PlayType.BIG_ROCKET
		) {
			io.to(socket.room.code).emit(
				"p-bet-landlord",
				socket.room.game.bet,
			);
			const playName =
				lastPlay.type === PlayType.BIG_ROCKET
					? "big rocket"
					: lastPlay.type === PlayType.ROCKET
						? "rocket"
						: "bomb";
			broadcastSystemChat(
				socket.room,
				`${socket.player.name || "A player"} played a ${playName}. Bet is now ${socket.room.game.bet}.`,
			);
		}

		if (result) {
			const isLandlord =
				socket.player.id === socket.room.game.landlord?.id;
			const reason = isLandlord
				? "Landlord victory!"
				: "Farmers victory!";

			applyRoundScore(socket.room, isLandlord);
			io.to(socket.room.code).emit("ended-room", reason);
			socket.room.endRoom();
		}
	});

	socket.on("send-chat", (rawMessage: string) => {
		if (!socket.room || typeof rawMessage !== "string") return;
		if (isRateLimited(socket, "send-chat", 8, 10_000)) {
			socket.emit("error", "Chat is sending too quickly.");
			return;
		}

		const message = rawMessage.trim().slice(0, 200);
		if (!message) return;

		socket.room.chat.push(socket.player.id, message);
		io.to(socket.room.code).emit("p-sent-chat", socket.player.id, message);
	});
}

function normalizeName(name: unknown): string | undefined {
	if (typeof name !== "string") return;
	return name.trim().slice(0, 20);
}

function normalizeRoomCode(code: unknown): string | undefined {
	if (typeof code !== "string") return;
	const normalized = code.trim().toUpperCase();
	if (!ROOM_CODE_PATTERN.test(normalized)) return;
	return normalized;
}

function normalizeBet(bet: unknown): number | undefined {
	if (typeof bet !== "number" || !Number.isInteger(bet)) return;
	if (bet < 0 || bet > 3) return;
	return bet;
}

function normalizeCards(cards: unknown): Card[] | undefined {
	if (!Array.isArray(cards) || cards.length > MAX_PLAY_CARDS) return;
	if (!cards.every(isCardPayload)) return;
	return cards;
}

function isCardPayload(value: unknown): value is Card {
	if (!value || typeof value !== "object") return false;

	const card = value as Partial<Card>;
	const validSuit =
		card.suit === "h" ||
		card.suit === "d" ||
		card.suit === "c" ||
		card.suit === "s" ||
		card.suit === "Red Joker" ||
		card.suit === "Black Joker";
	const validRank = Number.isInteger(card.rank);
	const validUid = card.uid === undefined || typeof card.uid === "string";

	return validSuit && validRank && validUid;
}

function isRateLimited(
	socket: GameSocket,
	key: string,
	limit: number,
	windowMs: number,
): boolean {
	const now = Date.now();
	const data = socket.data as {
		rateLimits?: Record<string, { count: number; resetAt: number }>;
	};
	data.rateLimits ??= {};

	const current = data.rateLimits[key];
	if (!current || current.resetAt <= now) {
		data.rateLimits[key] = { count: 1, resetAt: now + windowMs };
		return false;
	}

	current.count++;
	return current.count > limit;
}

function broadcastSystemChat(room: Room, message: string): void {
	room.chat.push("server", message);
	io.to(room.code).emit("p-sent-chat", "server", message);
}

function applyRoundScore(room: Room, landlordWon: boolean): void {
	const roundScore = Math.max(1, room.game.bet);
	const landlordId = room.game.landlord?.id;

	for (const player of room.players.values()) {
		const won = landlordWon
			? player.id === landlordId
			: player.id !== landlordId;
		if (!won && player.id === landlordId) {
			player.score -= roundScore * (room.players.size - 1);
		} else if (won && player.id === landlordId) {
			player.score += roundScore * (room.players.size - 1);
		} else if (!won && player.id !== landlordId) {
			player.score -= roundScore;
		} else if (won && player.id !== landlordId) {
			player.score += roundScore;
		}

		const gamePlayer = room.game.players.find((p) => p.id === player.id);
		if (gamePlayer) gamePlayer.score = player.score;

		io.to(room.code).emit("p-score-updated", player.id, player.score);
	}
}

function formatCards(cards: Card[]): string {
	if (cards.length === 0) return "none";
	return cards.map(cardToString).join(", ");
}

function emitStartedRoom(room: Room): void {
	for (const player of room.players.values()) {
		const playerSocket = [...gameSockets.values()].find(
			(s) => s.player.id === player.id,
		);

		if (playerSocket)
			playerSocket.emit("started-room", room.game.serialize(player.id));
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

	const playerInRoom = room.players.get(socket.player.id);
	if (playerInRoom) {
		cancelPendingDisconnect(socket.player.id);
		socket.leave(MENU_ROOM);
		socket.join(code);
		socket.room = room;
		socket.player.name = playerInRoom.name;
		playerInRoom.status = PlayerStatus.NOT_READY;
		socket.emit("joined-room", room.serialize(socket.player.id));
		socket
			.to(socket.room.code)
			.emit("p-set-status", socket.player.id, PlayerStatus.NOT_READY);
	} else {
		if (room.status !== RoomStatus.LOBBY) {
			socket.emit("error", "Game already in progress");
			return;
		}

		if (room.players.size >= MAX_ROOM_PLAYERS) {
			socket.emit("error", "Room is full");
			return;
		}

		socket.leave(MENU_ROOM);
		socket.join(code);
		socket.room = room;
		socket.player.status = PlayerStatus.NOT_READY;
		room.addPlayer(socket.player);
		io.to(socket.room.code).emit(
			"p-joined-room",
			socket.player.id,
			socket.player.name,
		);
		socket.emit("joined-room", room.serialize(socket.player.id));
	}
}

function handlePlayerLeave(socket: GameSocket): void {
	const room = socket.room;
	if (!room) return;

	socket.leave(room.code);

	if (room.status === RoomStatus.LOBBY) handleLobbyPlayerLeave(socket, room);
	else handleGamePlayerDisconnect(socket, room);

	if (room.status === RoomStatus.LOBBY && shouldDeleteRoom(room))
		deleteRoom(room.code);
}

function handleLobbyPlayerLeave(socket: GameSocket, room: Room): void {
	room.removePlayer(socket.player.id);
	socket.to(room.code).emit("p-left-room", socket.player.id);
}

function handleGamePlayerDisconnect(socket: GameSocket, room: Room): void {
	const player = room.players.get(socket.player.id);
	if (player) {
		player.status = PlayerStatus.DISCONNECTED;
		socket
			.to(room.code)
			.emit("p-set-status", socket.player.id, PlayerStatus.DISCONNECTED);
		scheduleDisconnectCleanup(socket.player.id, room.code);
	}
}

function scheduleDisconnectCleanup(playerId: string, roomCode: string): void {
	cancelPendingDisconnect(playerId);

	pendingDisconnects.set(
		playerId,
		setTimeout(() => {
			pendingDisconnects.delete(playerId);
			const room = rooms.get(roomCode);
			const player = room?.players.get(playerId);
			if (!room || player?.status !== PlayerStatus.DISCONNECTED) return;

			if (room.status === RoomStatus.PLAYING) {
				const reason = `${player.name || "A player"} disconnected. Round ended.`;
				io.to(room.code).emit("ended-room", reason);
				broadcastSystemChat(room, reason);
				room.endRoom();
			} else {
				room.removePlayer(playerId);
				io.to(room.code).emit("p-left-room", playerId);
			}

			if (shouldDeleteRoom(room)) deleteRoom(room.code);
		}, DISCONNECT_GRACE_MS),
	);
}

function cancelPendingDisconnect(playerId: string): void {
	const timeout = pendingDisconnects.get(playerId);
	if (!timeout) return;

	clearTimeout(timeout);
	pendingDisconnects.delete(playerId);
}

function shouldDeleteRoom(room: Room): boolean {
	return room.allPlayersDisconnected();
}

function deleteRoom(roomCode: string): void {
	rooms.delete(roomCode);
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
