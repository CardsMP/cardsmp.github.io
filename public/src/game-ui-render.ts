import { cardToString, type Card } from "@shared/card";
import type { Player } from "@shared/player";
import { GamePhase } from "@shared/game";
import { MAX_ROOM_PLAYERS } from "@shared/room";
import { gs } from "./session";
import {
	canPass,
	getSelectedCardObjects,
	isPlayersTurn,
	passTurn,
	playSelectedCards,
	tryPreMoveCurrentTurn,
} from "./game-ui-actions";
import {
	getCardKey,
	isPreMoveEnabled,
	selectedCardKeys,
	setPreMoveEnabled,
	togglePreMoveEnabled,
} from "./game-ui-state";
import {
	clearGameArea,
	escapeHtml,
	formatPlayType,
	getCardImagePath,
	makeBtn,
	preloadCardImages,
} from "./game-ui-utils";
import { getAssetPath, getRoomInviteURL } from "./app-paths";

const OPPONENT_CARD_BACK_PATH = getAssetPath("cards/back.png");

function isPlayerInCurrentRound(player: Player): boolean {
	return gs.room.game.players.some(
		(gamePlayer) => gamePlayer.id === player.id,
	);
}

function isCurrentPlayerInRound(): boolean {
	return gs.room.game.players.some(
		(gamePlayer) => gamePlayer.id === gs.player.id,
	);
}

function applyCardRowLayout(
	container: HTMLElement,
	totalCards: number,
	overlapVar?: string,
): void {
	const cardWidth = getCardLayoutWidth(container);
	const preferredGap = getCardLayoutGap(container);
	const availableWidth =
		container.clientWidth || container.getBoundingClientRect().width;
	const gapCount = Math.max(0, totalCards - 1);
	const cardWidthTotal = totalCards * cardWidth;
	const preferredWidth = cardWidthTotal + gapCount * preferredGap;

	if (totalCards <= 0 || availableWidth <= 0) {
		container.dataset.layoutMode = "gap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, "0px");
		} else {
			applyInlineCardOverlap(container, 0);
		}
		container.style.gap = `${preferredGap}px`;
		container.style.justifyContent = "center";
		return;
	}

	if (gapCount > 0 && cardWidthTotal > availableWidth) {
		const overlap =
			Math.min(
				cardWidth - 1,
				(cardWidthTotal - availableWidth) / gapCount,
			) || 0;
		container.dataset.layoutMode = "overlap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, `${overlap}px`);
		} else {
			applyInlineCardOverlap(container, overlap);
		}
		container.style.gap = "0px";
	} else {
		const gap =
			gapCount > 0
				? Math.min(
						preferredGap,
						(availableWidth - cardWidthTotal) / gapCount,
					)
				: preferredGap;

		container.dataset.layoutMode =
			gapCount > 0 && preferredWidth > availableWidth ? "fit-gap" : "gap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, "0px");
		} else {
			applyInlineCardOverlap(container, 0);
		}
		container.style.gap = `${Math.max(0, gap)}px`;
	}

	container.style.justifyContent = "center";
}

function getCardLayoutWidth(container: HTMLElement): number {
	for (const child of [...container.children]) {
		if (!(child instanceof HTMLElement)) continue;

		const measuredWidth = child.getBoundingClientRect().width;
		if (Number.isFinite(measuredWidth) && measuredWidth > 0)
			return measuredWidth;

		const computedWidth = Number.parseFloat(getComputedStyle(child).width);
		if (Number.isFinite(computedWidth) && computedWidth > 0)
			return computedWidth;
	}

	const parsedCardWidth = Number.parseFloat(
		getComputedStyle(container).getPropertyValue("--card-width"),
	);
	return Math.max(
		1,
		Number.isFinite(parsedCardWidth) ? parsedCardWidth : 102,
	);
}

function getCardLayoutGap(container: HTMLElement): number {
	const styles = getComputedStyle(container);
	const computedGap = Number.parseFloat(styles.columnGap || styles.gap);
	if (Number.isFinite(computedGap)) return Math.max(0, computedGap);

	const parsedGap = Number.parseFloat(styles.getPropertyValue("--card-gap"));
	return Math.max(0, Number.isFinite(parsedGap) ? parsedGap : 8);
}

function applyInlineCardOverlap(container: HTMLElement, overlap: number): void {
	for (const [index, child] of [...container.children].entries()) {
		if (!(child instanceof HTMLElement)) continue;
		child.style.marginLeft =
			index > 0 && overlap > 0 ? `${overlap * -1}px` : "0px";
	}
}

export function refreshCardLayouts(): void {
	const handArea = document.querySelector(
		"#card-hand-area",
	) as HTMLElement | null;
	if (handArea) applyCardRowLayout(handArea, handArea.childElementCount);

	for (const opponentHand of document.querySelectorAll<HTMLElement>(
		".opponent-hand",
	)) {
		applyCardRowLayout(opponentHand, opponentHand.childElementCount);
	}

	for (const tableCards of document.querySelectorAll<HTMLElement>(
		".table-played-cards",
	)) {
		applyCardRowLayout(
			tableCards,
			tableCards.childElementCount,
			"--table-overlap",
		);
	}
}

export function showRoomElements(): void {
	for (const screen of document.querySelectorAll(".screen"))
		screen.classList.add("hidden");

	const gameScreen = document.querySelector("#game") as HTMLDivElement;
	gameScreen.classList.remove("hidden");

	const codeEl = document.querySelector(
		"#game-room-code",
	) as HTMLButtonElement;
	if (codeEl) {
		const roomCode = gs.room.code || "";
		codeEl.textContent = roomCode;
		codeEl.title = roomCode
			? "Click to copy invite link"
			: "No room code available";
		codeEl.classList.toggle("is-clickable", !!roomCode);
		codeEl.disabled = !roomCode;
		codeEl.onclick = roomCode ? () => copyRoomInviteLink(roomCode) : null;
	}

	clearGameArea();
}

async function copyRoomInviteLink(roomCode: string): Promise<void> {
	const inviteLink = getRoomInviteURL(roomCode);

	try {
		await globalThis.navigator.clipboard?.writeText(inviteLink);
	} catch {}

	const textarea = document.createElement("textarea");
	textarea.value = inviteLink;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.top = "-1000px";
	textarea.style.opacity = "0";
	document.body.append(textarea);
	textarea.select();
	document.execCommand("copy");
	textarea.remove();
}

export function updateUIPlayerList(): void {
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

export function updateUIGame(): void {
	if (!gs.room || !gs.player) return;

	updateUIPlayerList();
	preloadVisibleCardImages();
	renderNameplates();
	renderCardHand();
	renderActionButtons();
	renderTurnBanner();
	renderTableMessage();
	updateGameInfoUI();
	runReadyPreMove();
}

function renderNameplates(): void {
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
				opponentHand = createOpponentHand(cardCount);
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

function getOwnHandArea(): HTMLElement {
	const existing = document.querySelector("#card-hand-area");
	if (existing instanceof HTMLElement) return existing;

	const hand = document.createElement("div");
	hand.id = "card-hand-area";
	return hand;
}

function createOpponentHand(cardCount: number): HTMLElement {
	const hand = document.createElement("div");
	hand.className = "opponent-hand";
	hand.setAttribute("aria-label", `${cardCount} face-down cards`);

	for (let index = 0; index < cardCount; index++) {
		const card = document.createElement("div");
		card.className = "hand-card";

		const img = document.createElement("img");
		img.className = "hand-card-face";
		img.src = OPPONENT_CARD_BACK_PATH;
		img.alt = "";
		img.draggable = false;

		card.append(img);
		hand.append(card);
	}

	return hand;
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

function preloadVisibleCardImages(): void {
	if (!gs.room?.game || gs.player.index === undefined) return;

	const myPlayer = gs.room.game.players[gs.player.index];
	const cards = myPlayer ? [...myPlayer.hand.cards] : [];
	if (gs.room.game.lastPlay?.cards?.length) {
		cards.push(...gs.room.game.lastPlay.cards);
	}

	preloadCardImages(cards);
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

	if (!gs.room || !gs.player) {
		banner.style.display = "none";
		return;
	}

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
	const msg = document.querySelector("#table-container") as HTMLElement;
	if (!msg) return;

	if (!gs.room || !gs.player) {
		msg.textContent = "";
		msg.className = "";
		return;
	}

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
		applyCardRowLayout(
			cards,
			game.lastPlay.cards.length,
			"--table-overlap",
		);
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
			renderActionButtons();
		});

		el.style.zIndex = "1";
		handArea.append(el);
	}

	applyCardRowLayout(handArea, handArea.childElementCount);
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

	if (game.phase !== GamePhase.FINISHED && !isCurrentPlayerInRound()) {
		const waitingBtn = makeBtn("Waiting for next round", "", () => {});
		waitingBtn.disabled = true;
		container.append(waitingBtn);
		return;
	}

	const isTurn = isPlayersTurn();

	switch (game.phase) {
		case GamePhase.FINISHED: {
			const playerCount = gs.room.players.size;
			const needsPlayers =
				playerCount < 3 || playerCount > MAX_ROOM_PLAYERS;
			if (needsPlayers) {
				const needsPlayersBtn = makeBtn(
					"Need 3-4 Players",
					"",
					() => {},
				);
				needsPlayersBtn.disabled = true;
				container.append(needsPlayersBtn);
			} else {
				const resetBtn = makeBtn("Start Round", "", () =>
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
			const playBtn = makeBtn("Play", "", () => {
				if (playSelectedCards()) {
					renderCardHand();
					renderActionButtons();
				}
			});
			const passBtn = makeBtn("Pass", "", () => {
				if (passTurn()) {
					renderCardHand();
					renderActionButtons();
				}
			});
			playBtn.disabled = !isTurn || getSelectedCardObjects().length === 0;
			passBtn.disabled = !canPass();

			if (isTurn) container.append(playBtn, passBtn);
			else container.append(createPreMoveButton());
			break;
		}
	}
}

function createPreMoveButton(): HTMLButtonElement {
	const hasSelectedCards = getSelectedCardObjects().length > 0;
	const label = hasSelectedCards ? "Pre-play" : "Pre-pass";

	const preMoveBtn = makeBtn(label, "btn-preplay", () => {
		const enabled = togglePreMoveEnabled();
		if (enabled && tryPreMoveCurrentTurn()) {
			renderCardHand();
		}
		renderActionButtons();
	});
	const enabled = isPreMoveEnabled();
	preMoveBtn.classList.toggle("is-active", enabled);
	preMoveBtn.setAttribute("aria-pressed", String(enabled));
	return preMoveBtn;
}

function runReadyPreMove(): void {
	if (!tryPreMoveCurrentTurn()) return;
	renderCardHand();
	renderActionButtons();
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
	setPreMoveEnabled(false);
	updateUIGame();
}

export function endGameUI(): void {
	selectedCardKeys.clear();
	setPreMoveEnabled(false);
	updateUIGame();
}
