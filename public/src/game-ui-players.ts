import type { Player } from "@shared/player";
import {
	applyCardRowLayout,
	createOpponentHand,
	getOwnHandArea,
} from "./game-ui-cards";
import { escapeHtml } from "./game-ui-utils";
import { gs } from "./session";

export function renderPlayerList(): void {
	if (!gs.room) return;

	const playerList = document.querySelector("#player-list");
	if (!playerList) return;

	playerList.innerHTML = "";
	for (const player of getSortedRoomPlayers()) {
		const div = document.createElement("div");
		div.className = "player-item";

		const isLandlord = gs.room.game.landlord?.id === player.id;
		const isYou = player.id === gs.player.id;
		const score = player.score ?? 0;

		div.innerHTML = `
			<div class="player-name">${escapeHtml(player.name || "?")}${isYou ? " (You)" : ""}${isLandlord ? '<span class="landlord-indicator">L</span>' : ""}</div>
			<div class="card-count">${score}</div>
		`;
		playerList.append(div);
	}
}

export function renderNameplates(): void {
	if (!gs.room || !gs.player) return;

	for (const el of document.querySelectorAll(".player-seat")) el.remove();

	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();

	const gameTable = document.querySelector("#field-area") as HTMLElement;
	const seatedPlayers = getSeatedPlayers();

	for (let rel = 0; rel < 4; rel++) {
		const player = seatedPlayers[rel];
		const seatEl = document.createElement("div");
		seatEl.className = `player-seat ${getNameplatePositionClass(rel)}${rel === 0 ? " is-own" : ""}${player ? "" : " is-empty"}`;

		const plate = document.createElement("div");
		plate.className = `player-nameplate${rel === 0 ? " is-own" : ""}${player ? "" : " is-empty"}`;
		let opponentHand: HTMLElement | undefined;
		let ownHand: HTMLElement | undefined;

		if (player) {
			const game = gs.room.game;
			const isInCurrentRound = isPlayerInCurrentRound(player);
			const isTurn =
				isInCurrentRound && game.currentIndex === player.index;
			const isLandlord = game?.landlord?.id === player.id;
			const cardCount = player.handCount ?? player.hand.cards.length;
			const seat = player.index ?? rel;
			const name = player.name || `P${seat + 1}`;
			const hasRound = game?.players?.length > 0;
			const detail = isInCurrentRound
				? `${cardCount} cards left`
				: hasRound
					? "Next round"
					: "";

			plate.classList.add(
				...[
					isTurn ? "is-turn" : "",
					detail ? "has-detail" : "no-detail",
				].filter(Boolean),
			);

			plate.innerHTML = `
				<div class="nameplate-name">${escapeHtml(name)}${player.id === gs.player.id ? " (You)" : ""}${isLandlord ? '<span class="landlord-indicator">L</span>' : ""}</div>
				${detail ? `<div class="nameplate-cards">${detail}</div>` : ""}
			`;

			if (rel !== 0 && isInCurrentRound && cardCount > 0)
				opponentHand = createOpponentHand(cardCount, player.id);
			else if (rel === 0 && isInCurrentRound) ownHand = getOwnHandArea();
		} else {
			plate.innerHTML = "";
		}

		const hand = ownHand ?? opponentHand;
		if (hand)
			seatEl.classList.add(
				"has-card-hand",
				ownHand ? "has-own-hand" : "has-opponent-hand",
			);

		seatEl.append(plate);
		if (hand) seatEl.append(hand);
		gameTable.append(seatEl);

		if (opponentHand)
			applyCardRowLayout(opponentHand, opponentHand.childElementCount);
	}
}

function isPlayerInCurrentRound(player: Player): boolean {
	return gs.room.game.players.some(
		(gamePlayer) => gamePlayer.id === player.id,
	);
}

function getSeatedPlayers(): Player[] {
	if (!gs.room || !gs.player) return [];

	const gamePlayers = gs.room.game.players;
	const myGameIndex = gs.player.index;
	if (gamePlayers.length > 0 && myGameIndex !== undefined) {
		return [...gamePlayers].sort((a, b) => {
			const aRel =
				((a.index ?? 0) - myGameIndex + gamePlayers.length) %
				gamePlayers.length;
			const bRel =
				((b.index ?? 0) - myGameIndex + gamePlayers.length) %
				gamePlayers.length;
			return aRel - bRel;
		});
	}

	const players = getSortedRoomPlayers();
	const ownIndex = players.findIndex((player) => player.id === gs.player.id);
	if (ownIndex <= 0) return players;
	return [...players.slice(ownIndex), ...players.slice(0, ownIndex)];
}

function getSortedRoomPlayers(): Player[] {
	if (!gs.room) return [];

	const players = [...gs.room.players.values()];

	return players.sort((a, b) => {
		const aHasIndex = a.index !== undefined;
		const bHasIndex = b.index !== undefined;
		if (aHasIndex || bHasIndex) {
			if (!aHasIndex) return 1;
			if (!bHasIndex) return -1;
			if (a.index !== b.index) return (a.index ?? 0) - (b.index ?? 0);
		}

		return (a.name || a.id).localeCompare(b.name || b.id);
	});
}

function getNameplatePositionClass(relativeIndex: number): string {
	if (relativeIndex === 0) return "nameplate-own";
	if (relativeIndex === 1) return "nameplate-right";
	if (relativeIndex === 2) return "nameplate-left";
	return "nameplate-top";
}
