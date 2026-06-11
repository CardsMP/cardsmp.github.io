import { cardToString, type Card } from "@shared/card";
import type { Player } from "@shared/player";
import { GamePhase } from "@shared/game";
import { MAX_ROOM_PLAYERS } from "@shared/room";
import { gs } from "./session";
import { getCardKey, selectedCardKeys } from "./game-ui-state";
import {
	clearGameArea,
	escapeHtml,
	formatPlayType,
	getCardImagePath,
	makeBtn,
} from "./game-ui-utils";

function isPlayersTurn(): boolean {
	return gs.player.index === gs.room.game.currentIndex;
}

function canPass(): boolean {
	const game = gs.room.game;
	return (
		game.phase === GamePhase.PLAYING &&
		!!game.lastPlay &&
		game.lastPlay.playerIndex !== gs.player.index
	);
}

function getSelectedCardObjects(): Card[] {
	const myPlayer = gs.room.game.players[gs.player.index ?? 0];
	if (!myPlayer) return [];

	return myPlayer.hand.cards.filter((card) =>
		selectedCardKeys.has(getCardKey(card)),
	);
}

export function showRoomElements(): void {
	for (const screen of document.querySelectorAll(".screen"))
		screen.classList.add("hidden");

	const gameScreen = document.querySelector("#game") as HTMLDivElement;
	gameScreen.classList.remove("hidden");

	const codeEl = document.querySelector("#game-room-code") as HTMLSpanElement;
	if (codeEl) codeEl.textContent = gs.room.code || "";

	clearGameArea();
}

export function updateUIPlayerList(): void {
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

export function updateUIGame(): void {
	updateUIPlayerList();
	renderNameplates();
	renderCardHand();
	renderActionButtons();
	renderTurnBanner();
	renderTableMessage();
	updateGameInfoUI();
}

function renderNameplates(): void {
	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();

	const gameTable = document.querySelector("#game-area-table") as HTMLElement;
	const seatedPlayers = getSeatedPlayers();

	for (let rel = 0; rel < 4; rel++) {
		const player = seatedPlayers[rel];
		const plate = document.createElement("div");
		plate.className = `player-nameplate ${getNameplatePositionClass(rel)}${rel === 0 ? " is-own" : ""}${player ? "" : " is-empty"}`;

		if (player) {
			const game = gs.room.game;
			const isTurn =
				game?.players?.length > 0 && game.currentIndex === player.index;
			const isLandlord = game.landlord?.id === player.id;
			const cardCount = player.handCount ?? player.hand.cards.length;
			const seat = player.index ?? rel;
			const name = player.name || `P${seat + 1}`;
			const hasDetail = game?.players?.length > 0;
			const detail = hasDetail ? `${cardCount} cards left` : "";

			plate.classList.add(
				...[
					isTurn ? "is-turn" : "",
					hasDetail ? "has-detail" : "no-detail",
				].filter(Boolean),
			);

			plate.innerHTML = `
				<div class="nameplate-inner">
					<div class="nameplate-name">${escapeHtml(name)}${player.id === gs.player.id ? " (You)" : ""}${isLandlord ? '<span class="landlord-indicator">L</span>' : ""}</div>
					${detail ? `<div class="nameplate-cards">${detail}</div>` : ""}
				</div>
			`;
		} else {
			plate.innerHTML = "";
		}

		gameTable.append(plate);
	}
}

function getSeatedPlayers(): Player[] {
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
	const players =
		gs.room.game.players.length > 0
			? [...gs.room.game.players]
			: [...gs.room.players.values()];

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

function renderTurnBanner(): void {
	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (!banner) return;

	const game = gs.room.game;
	if (!game?.current) {
		banner.style.display = "none";
		return;
	}

	const currentName = game.players[game.currentIndex]?.name || "Unknown";
	const isYou = game.currentIndex === gs.player.index;

	if (game.phase === "bidding") {
		banner.textContent = isYou
			? "Your turn to bid."
			: `${currentName}'s turn to bid.`;
		banner.style.display = "flex";
	} else if (game.phase === "playing") {
		banner.textContent = isYou
			? "Your turn to play."
			: `${currentName}'s turn to play.`;
		banner.style.display = "flex";
	} else {
		banner.textContent = "";
		banner.style.display = "none";
	}
}

function renderTableMessage(): void {
	const msg = document.querySelector("#table-center-message") as HTMLElement;
	if (!msg) return;

	const game = gs.room.game;
	msg.style.display = "flex";

	if (!game) {
		msg.classList.add("is-empty");
		msg.replaceChildren();
		return;
	}

	if (game.phase === "bidding") {
		msg.classList.remove("is-empty");
		msg.textContent = "Betting round, winner takes the bottom.";
	} else if (game.phase === "playing" && game.lastPlay) {
		msg.classList.remove("is-empty");
		const playerName =
			game.players[game.lastPlay.playerIndex]?.name || "Unknown";
		const type = formatPlayType(game.lastPlay.type);
		msg.innerHTML = "";

		const title = document.createElement("div");
		title.className = "table-play-title";
		title.innerHTML = `<strong>${escapeHtml(playerName)}</strong> played`;

		const cards = document.createElement("div");
		cards.className = "table-played-cards";
		for (const card of game.lastPlay.cards)
			cards.append(createTableCardImage(card));

		const footer = document.createElement("div");
		footer.className = "table-play-type";
		footer.textContent = type;

		msg.append(title, cards, footer);
	} else if (game.phase === GamePhase.FINISHED) {
		msg.classList.remove("is-empty");
		msg.textContent = "Round over. Anyone can reset the round.";
	} else {
		msg.classList.add("is-empty");
		msg.replaceChildren();
	}
}

export function renderCardHand(): void {
	const handArea = document.querySelector("#card-hand-area") as HTMLElement;
	if (!handArea) return;
	handArea.innerHTML = "";

	const game = gs.room.game;
	if (!game?.players || gs.player.index === undefined) return;

	const myPlayer = game.players[gs.player.index];
	if (!myPlayer) return;

	const cardWidth = 102;
	const defaultGap = 8;
	const totalCards = myPlayer.hand.cards.length;
	const availableWidth =
		handArea.clientWidth || handArea.getBoundingClientRect().width;
	const naturalWidth =
		totalCards * cardWidth + Math.max(0, totalCards - 1) * defaultGap;
	if (totalCards > 1 && naturalWidth > availableWidth) {
		const overlap =
			Math.min(
				cardWidth - 1,
				(naturalWidth - availableWidth) / (totalCards - 1),
			) || 0;
		handArea.dataset.layoutMode = "overlap";
		handArea.style.setProperty("--hand-overlap", `${overlap}px`);
		handArea.style.gap = "0px";
	} else {
		handArea.dataset.layoutMode = "gap";
		handArea.style.setProperty("--hand-overlap", "0px");
		handArea.style.gap = `${defaultGap}px`;
	}
	handArea.style.justifyContent = "center";

	const currentKeys = new Set(
		myPlayer.hand.cards.map((card) => getCardKey(card)),
	);
	for (const key of [...selectedCardKeys]) {
		if (!currentKeys.has(key)) selectedCardKeys.delete(key);
	}

	for (const [index, card] of myPlayer.hand.cards.entries()) {
		const el = document.createElement("div");
		const cardKey = getCardKey(card);
		el.className = "hand-card";
		el.setAttribute("aria-label", cardToString(card));

		if (selectedCardKeys.has(cardKey)) el.classList.add("selected");

		const img = document.createElement("img");
		img.className = "hand-card-face";
		img.src = getCardImagePath(card);
		img.alt = cardToString(card);
		img.draggable = false;
		el.append(img);

		el.addEventListener("click", () => {
			if (selectedCardKeys.has(cardKey)) {
				selectedCardKeys.delete(cardKey);
				el.classList.remove("selected");
			} else {
				selectedCardKeys.add(cardKey);
				el.classList.add("selected");
			}
		});

		el.style.zIndex = "1";
		handArea.append(el);
	}
}

function createTableCardImage(card: Card): HTMLImageElement {
	const img = document.createElement("img");
	img.className = "table-card-img";
	img.src = getCardImagePath(card);
	img.alt = cardToString(card);
	img.draggable = false;
	return img;
}

function renderActionButtons(): void {
	const container = document.querySelector("#action-buttons") as HTMLElement;
	if (!container) return;
	container.innerHTML = "";

	const game = gs.room.game;
	if (!game) return;

	const isTurn = isPlayersTurn();

	switch (game.phase) {
		case GamePhase.FINISHED: {
			const playerCount = gs.room.players.size;
			const needsPlayers =
				playerCount < 3 || playerCount > MAX_ROOM_PLAYERS;
			if (needsPlayers) {
				const needsPlayersBtn = makeBtn(
					"Need 3-4 Players to Reset",
					"",
					() => {},
				);
				needsPlayersBtn.disabled = true;
				container.append(needsPlayersBtn);
			} else {
				const resetBtn = makeBtn("Start New Round", "", () =>
					gs.socket.emit("reset-room"),
				);
				container.append(resetBtn);
			}
			break;
		}

		case GamePhase.BIDDING: {
			const currentBet = game.bet ?? 0;

			const bid1 = makeBtn("1", "", () =>
				gs.socket.emit("bet-landlord", 1),
			);
			const bid2 = makeBtn("2", "", () =>
				gs.socket.emit("bet-landlord", 2),
			);
			const bid3 = makeBtn("3", "", () =>
				gs.socket.emit("bet-landlord", 3),
			);
			const pass = makeBtn("Pass", "", () =>
				gs.socket.emit("bet-landlord", 0),
			);

			if (!isTurn || currentBet >= 1)
				(bid1 as HTMLButtonElement).disabled = true;
			if (!isTurn || currentBet >= 2)
				(bid2 as HTMLButtonElement).disabled = true;
			if (!isTurn || currentBet >= 3)
				(bid3 as HTMLButtonElement).disabled = true;
			if (!isTurn) (pass as HTMLButtonElement).disabled = true;

			container.append(bid1, bid2, bid3, pass);
			break;
		}

		case GamePhase.PLAYING: {
			if (!isTurn) break;

			const playBtn = makeBtn("Play", "", () => {
				const cards = getSelectedCardObjects();
				if (cards.length === 0) return;
				gs.socket.emit("play-cards", cards);
				selectedCardKeys.clear();
				renderCardHand();
			});
			const passBtn = makeBtn("Pass", "", () => {
				if (!canPass()) return;
				gs.socket.emit("play-cards", []);
				selectedCardKeys.clear();
				renderCardHand();
			});
			passBtn.disabled = !canPass();

			container.append(playBtn, passBtn);
			break;
		}
	}
}

function updateGameInfoUI(): void {
	const game = gs.room.game;
	const gameInfo = document.querySelector("#game-info") as HTMLDivElement;
	if (!gameInfo) return;

	if (!game || game.phase === GamePhase.FINISHED) {
		gameInfo.innerHTML = "";
		return;
	}

	const landlordName = game.landlord?.id
		? gs.room.players.get(game.landlord.id)?.name || "—"
		: "—";

	gameInfo.innerHTML = `
		<div class="info-row">
			<span class="info-label">Phase</span>
			<span class="info-value">${game.phase}</span>
		</div>
		<div class="info-row">
			<span class="info-label">Landlord</span>
			<span class="info-value">${escapeHtml(landlordName)}</span>
		</div>
		<div class="info-row">
			<span class="info-label">Bet</span>
			<span class="info-value">${game.bet ?? 0}</span>
		</div>
	`;
}

export function startGameUI(): void {
	selectedCardKeys.clear();
	updateUIGame();
}

export function endGameUI(): void {
	selectedCardKeys.clear();
	updateUIGame();
}
