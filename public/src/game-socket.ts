import type { Card } from "@shared/card";
import type { SerializedGame } from "@shared/game";
import { Game, GamePhase } from "@shared/game";
import { Player, type PlayerStatus } from "@shared/player";
import { Room, RoomStatus, type SerializedRoom } from "@shared/room";
import { updateUIAllChat, updateUIPushChat } from "./game-ui-chat";
import { gs } from "./session";
import {
	endGameUI,
	preloadCardImages,
	showRoomElements,
	startGameUI,
	updateUIGame,
	updateUIPlayerList,
} from "./game-ui-utils";
import { getLocalGamePlayer } from "./game-ui-local-player";
import { updateURL } from "./url";

export function initGameSocket(): void {
	gs.socket.on("sent-player", (name: string) => {
		gs.player.name = name;
	});

	gs.socket.on("joined-room", (raw: SerializedRoom) => {
		const room = Room.deserialize(raw);
		updateURL(room.code);

		gs.room = room;
		gs.player = room.players.get(gs.player.id) ?? gs.player;
		if (gs.room.game) {
			const currentPlayer = getLocalGamePlayer();
			if (currentPlayer) preloadCardImages(currentPlayer.hand.cards);
			if (gs.room.game.lastPlay?.cards?.length) {
				preloadCardImages(gs.room.game.lastPlay.cards);
			}
		}
		showRoomElements();
		updateUIPlayerList();
		updateUIAllChat();
		updateUIGame();

		if (room.status === RoomStatus.PLAYING) startGameUI();
		else endGameUI();
	});

	gs.socket.on("p-joined-room", (id: string, name: string) => {
		if (id === gs.player.id) return;
		gs.room.addPlayer(new Player(id, name));
		updateUIGame();
	});

	gs.socket.on("p-left-room", (id: string) => {
		gs.room.removePlayer(id);
		updateUIGame();
	});

	gs.socket.on("p-set-status", (id: string, status: PlayerStatus) => {
		const player = gs.room.getPlayer(id);
		if (!player) return;
		player.status = status;
		updateUIGame();
	});

	gs.socket.on("started-room", (raw: SerializedGame) => {
		gs.room.game = Game.deserialize(raw);
		gs.player =
			gs.room.game.players.find((p) => p.id === gs.player.id) ??
			gs.player;
		syncRoomPlayersFromGame();
		if (gs.room.game) {
			const currentPlayer = getLocalGamePlayer();
			if (currentPlayer) preloadCardImages(currentPlayer.hand.cards);
		}

		startGameUI();
	});

	gs.socket.on("p-bet-landlord", (bet: number) => {
		if (gs.room.game.phase === GamePhase.BIDDING) {
			gs.room.game.betLandlord(bet);
		} else {
			gs.room.game.bet = bet;
		}
		updateUIGame();
	});

	gs.socket.on(
		"p-became-landlord",
		(playerId: string | undefined, handCount: number) => {
			applyLandlordTransition(playerId, handCount);
			updateUIPushChat({
				id: "server",
				message: `${playerId ? gs.room.players.get(playerId)?.name : "A player"} is the landlord!`,
			});
			updateUIGame();
		},
	);

	gs.socket.on("p-landlord-bottom", (bottom: Card[]) => {
		preloadCardImages(bottom);
		applyLandlordBottom(bottom);
		updateUIGame();
	});

	gs.socket.on("p-played-cards", (cards: Card[]) => {
		gs.room.game.playCards(cards, false);
		syncRoomPlayersFromGame();

		updateUIGame();
	});

	gs.socket.on("p-score-updated", (id: string, score: number) => {
		applyScoreUpdate(id, score);
		updateUIPlayerList();
		updateUIGame();
	});

	gs.socket.on("ended-room", (reason: string) => {
		gs.room.endRoom();
		endGameUI();
		updateUIPushChat({
			id: "server",
			message: reason,
		});
	});

	gs.socket.on("p-sent-chat", (id: string, message: string) => {
		gs.room.chat.push(id, message);
		updateUIPushChat({ id, message });
	});
}

function applyScoreUpdate(id: string, score: number): void {
	const roomPlayer = gs.room.players.get(id);
	if (roomPlayer) roomPlayer.score = score;

	const gamePlayer = gs.room.game.players.find((player) => player.id === id);
	if (gamePlayer) gamePlayer.score = score;

	if (gs.player.id === id) gs.player.score = score;
}

function syncRoomPlayersFromGame(): void {
	for (const gamePlayer of gs.room.game.players) {
		const handCount = Math.max(
			gamePlayer.hand.cards.length,
			gamePlayer.handCount,
		);
		gamePlayer.handCount = handCount;

		const roomPlayer = gs.room.players.get(gamePlayer.id);
		if (!roomPlayer) continue;

		roomPlayer.handCount = handCount;
		roomPlayer.score = gamePlayer.score;
		roomPlayer.status = gamePlayer.status;
		roomPlayer.index = gamePlayer.index;
	}
}

function applyLandlordTransition(
	playerId: string | undefined,
	handCount: number,
): void {
	const game = gs.room.game;
	const landlordIndex = playerId
		? game.players.findIndex((player) => player.id === playerId)
		: game.landlordIndex ?? game.currentIndex;

	if (landlordIndex < 0) return;

	game.landlordIndex = landlordIndex;
	game.bottom = [];
	game.phase = GamePhase.PLAYING;
	game.currentIndex = landlordIndex;
	game.lastPlay = undefined;
	game.players[landlordIndex].handCount = handCount;

	syncRoomPlayersFromGame();
}

function applyLandlordBottom(bottom: Card[]): void {
	const game = gs.room.game;
	const landlord =
		game.landlord ?? game.players.find((player) => player.id === gs.player.id);
	if (!landlord) return;

	landlord.hand.cards.push(...bottom);
	landlord.hand.sort();
	landlord.handCount = landlord.hand.cards.length;

	syncRoomPlayersFromGame();
}
