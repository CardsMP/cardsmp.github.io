// game-ui.ts — rewritten for new UI layout
import type { Card } from "@shared/card";
import type { ChatMessage } from "@shared/chat";
import type { Player } from "@shared/player";
import { leaveRoom } from "./menu-ui";
import { gs } from "./session";
import { GamePhase } from "@shared/game";

let pingIntervalID: number = 0;
let pingStartTime: number = 0;

// Selected cards set (key: "index")
let selectedCards: Set<number> = new Set();

// ─────────────────────────────────────────────
// MARK: Init
// ─────────────────────────────────────────────

export function initGameControls(): void {
	const leaveGameButton = document.querySelector("#leave-game-btn");
	leaveGameButton?.addEventListener("click", () => {
		leaveRoom();
		clearGameArea();
	});

	const chatInput = document.querySelector("#chat-input") as HTMLInputElement;
	chatInput?.addEventListener("keydown", (e: Event) => {
		const ke = e as KeyboardEvent;
		e.stopPropagation();
		if (ke.key === "Enter") {
			ke.preventDefault();
			sendChatMessage(chatInput);
		}
	});

	// Keyboard shortcuts
	document.addEventListener("keydown", (event: Event) => {
		const ke = event as KeyboardEvent;
		const target = ke.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

		if (ke.key === " " || ke.key === "Enter") {
			ke.preventDefault();
			handlePlayCards();
		}
		if (ke.key === "p" || ke.key === "P") {
			ke.preventDefault();
			handlePass();
		}
	});
}

// ─────────────────────────────────────────────
// MARK: Game Actions
// ─────────────────────────────────────────────

function handlePlayCards(): void {
	const game = gs.room.game;
	if (!isPlayersTurn()) return;

	const cards = getSelectedCardObjects();
	if (cards.length === 0) {
		showNotification("Select cards to play");
		return;
	}
	gs.socket.emit("play-cards", cards);
	selectedCards.clear();
	renderCardHand();
}

function handlePass(): void {
	if (!isPlayersTurn()) return;
	if (!canPass()) {
		showNotification("You must play to lead the trick");
		return;
	}
	gs.socket.emit("play-cards", []);
	selectedCards.clear();
	renderCardHand();
}

function handleBid(amount: number): void {
	gs.socket.emit("bet-landlord", amount);
}

function handleStartGame(): void {
	gs.socket.emit("start-room");
}

function isPlayersTurn(): boolean {
	return gs.player.index === gs.room.game.currentIndex;
}

function isHost(): boolean {
	return [...gs.room.players.keys()][0] === gs.player.id;
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
	return [...selectedCards]
		.sort((a, b) => a - b)
		.map((i) => myPlayer.hand.cards[i])
		.filter(Boolean);
}

// ─────────────────────────────────────────────
// MARK: Ping
// ─────────────────────────────────────────────

function initPingIndicator(): void {
	gs.socket.on("pong", () => {
		const pingTime = Date.now() - pingStartTime;
		updatePingDisplay(pingTime);
	});
	startPingUpdates();
}

function updatePingDisplay(ping: number): void {
	const ranges = [
		{ max: 50, bars: 5, color: "var(--green)" },
		{ max: 100, bars: 4, color: "var(--green-yellow)" },
		{ max: 150, bars: 3, color: "var(--yellow)" },
		{ max: 250, bars: 2, color: "var(--yellow-red)" },
		{ max: Infinity, bars: 1, color: "var(--red)" },
	];

	const foundRange = ranges.find((r) => ping < r.max);
	if (!foundRange) return;
	const { bars: activeBars, color } = foundRange;

	const bars = document.querySelectorAll(".ping-bar");
	for (const [index, bar] of bars.entries()) {
		const el = bar as HTMLElement;
		if (index < activeBars) {
			el.style.backgroundColor = color;
			el.style.opacity = "1";
		} else {
			el.style.backgroundColor = "var(--border-strong)";
			el.style.opacity = "0.25";
		}
	}
}

function sendPing(): void {
	pingStartTime = Date.now();
	gs.socket.emit("ping");
}

export function startPingUpdates(): void {
	stopPingUpdates();
	sendPing();
	pingIntervalID = globalThis.setInterval(() => sendPing(), 5000);
}

export function stopPingUpdates(): void {
	clearInterval(pingIntervalID);
}

// ─────────────────────────────────────────────
// MARK: Room UI
// ─────────────────────────────────────────────

export function showRoomElements(): void {
	for (const screen of document.querySelectorAll(".screen"))
		screen.classList.add("hidden");

	const gameScreen = document.querySelector("#game") as HTMLDivElement;
	gameScreen.classList.remove("hidden");

	const codeEl = document.querySelector("#game-room-code") as HTMLSpanElement;
	if (codeEl) codeEl.textContent = gs.room.code || "";

	initPingIndicator();
	clearGameArea();
}

export function updateReadyButton(): void {
	// Ready button is now in action-buttons area — handled in renderActionButtons
	renderActionButtons();
}

// ─────────────────────────────────────────────
// MARK: Player List (Scoreboard)
// ─────────────────────────────────────────────

export function updateUIPlayerList(): void {
	const playerList = document.querySelector("#player-list");
	if (!playerList) return;
	playerList.innerHTML = "";

	for (const player of getSortedRoomPlayers()) {
		const div = document.createElement("div");
		div.className = "player-item";

		const isLandlord = gs.room.game.landlord?.id === player.id;
		const isYou = player.id === gs.player.id;
		const score = 0;

		div.innerHTML = `
			<div class="player-name">${escapeHtml(player.name || "?")}${isYou ? " (You)" : ""}${isLandlord ? '<span class="landlord-indicator">L</span>' : ""}</div>
			<div class="player-score">${score}</div>
		`;
		playerList.append(div);
	}
}

// ─────────────────────────────────────────────
// MARK: Full Game UI Update
// ─────────────────────────────────────────────

export function updateUIGame(): void {
	updateUIPlayerList();
	renderNameplates();
	renderCardHand();
	renderActionButtons();
	renderTurnBanner();
	renderTableMessage();
	updateGameInfoUI();
}

// ─────────────────────────────────────────────
// MARK: Nameplates
// ─────────────────────────────────────────────

function renderNameplates(): void {
	// Remove old nameplates
	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();

	const gameArea = document.querySelector("#game-area") as HTMLElement;
	const seatedPlayers = getSeatedPlayers();
	if (seatedPlayers.length === 0) return;

	for (const [rel, player] of seatedPlayers.entries()) {
		const seat = player.index ?? rel;
		const game = gs.room.game;
		const isTurn =
			game?.players?.length > 0 && game.currentIndex === player.index;
		const isLandlord = game.landlord?.id === player.id;
		const cardCount = player.hand.cards.length;
		const name = player.name || `P${seat + 1}`;
		const detail =
			game?.players?.length > 0
				? `${cardCount} cards left`
				: formatPlayerStatus(player.status);

		const plate = document.createElement("div");
		plate.className = `player-nameplate ${getNameplatePositionClass(rel)}${isTurn ? " is-turn" : ""}${rel === 0 ? " is-own" : ""}`;

		plate.innerHTML = `
			<div class="nameplate-inner">
				<div class="nameplate-name">${escapeHtml(name)}${player.id === gs.player.id ? " (You)" : ""}${isLandlord ? '<span class="landlord-indicator">L</span>' : ""}</div>
				<div class="nameplate-cards">${detail}</div>
			</div>
		`;

		// Insert before card-hand-area
		const handArea = document.querySelector("#card-hand-area");
		gameArea.insertBefore(plate, handArea);
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

function formatPlayerStatus(status: string): string {
	return status.replace(/_/g, " ");
}

// ─────────────────────────────────────────────
// MARK: Turn Banner
// ─────────────────────────────────────────────

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
		banner.style.display = "block";
	} else if (game.phase === "playing") {
		banner.textContent = isYou
			? "Your turn to play."
			: `${currentName}'s turn to play.`;
		banner.style.display = "block";
	} else {
		banner.style.display = "none";
	}
}

// ─────────────────────────────────────────────
// MARK: Table Center Message
// ─────────────────────────────────────────────

function renderTableMessage(): void {
	const msg = document.querySelector("#table-center-message") as HTMLElement;
	if (!msg) return;

	const game = gs.room.game;

	if (game.phase === "bidding") {
		msg.textContent = "Betting round, winner takes the kitty.";
		msg.style.display = "flex";
	} else if (game.phase === "playing" && game.lastPlay) {
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
		msg.style.display = "flex";
	} else if (game.phase === GamePhase.FINISHED) {
		msg.textContent = "Waiting for the host to start.";
		msg.style.display = "flex";
	} else {
		msg.style.display = "none";
	}
}

// ─────────────────────────────────────────────
// MARK: Card Hand
// ─────────────────────────────────────────────

function renderCardHand(): void {
	const handArea = document.querySelector("#card-hand-area") as HTMLElement;
	if (!handArea) return;
	handArea.innerHTML = "";

	const game = gs.room.game;
	if (!game?.players || gs.player.index === undefined) return;

	const myPlayer = game.players[gs.player.index];
	if (!myPlayer) return;

	const cards = myPlayer.hand.cards;

	for (const [index, card] of cards.entries()) {
		const el = document.createElement("div");
		const { label } = getCardDisplay(card);
		el.className = "hand-card";
		el.setAttribute("aria-label", label);

		if (selectedCards.has(index)) el.classList.add("selected");

		const img = document.createElement("img");
		img.className = "hand-card-face";
		img.src = getCardImagePath(card);
		img.alt = label;
		img.draggable = false;
		el.append(img);

		el.addEventListener("click", () => {
			if (selectedCards.has(index)) {
				selectedCards.delete(index);
				el.classList.remove("selected");
				el.style.transform = "";
			} else {
				selectedCards.add(index);
				el.classList.add("selected");
			}
		});

		el.style.zIndex = "1";
		handArea.append(el);
	}
}

function getCardDisplay(card: Card): {
	rank: string;
	suit: string;
	isRed: boolean;
	label: string;
} {
	if (card.type === "Flipped") {
		return { rank: "", suit: "", isRed: false, label: "Flipped" };
	}

	if (card.type === "Joker") {
		const isRed = card.color === "RED";
		return {
			rank: isRed ? "🃟" : "🃏",
			suit: isRed ? "Red" : "Blk",
			isRed,
			label: isRed ? "Red Joker" : "Black Joker",
		};
	}

	const rankMap: Record<number, string> = {
		1: "A",
		11: "J",
		12: "Q",
		13: "K",
	};
	const suitMap: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };
	const isRed = card.suit === "h" || card.suit === "d";

	const rank = rankMap[card.rank] ?? String(card.rank);
	const suit = suitMap[card.suit] ?? "";

	return { rank, suit, isRed, label: `${rank}${suit}` };
}

function createTableCardImage(card: Card): HTMLImageElement {
	const img = document.createElement("img");
	const { label } = getCardDisplay(card);
	img.className = "table-card-img";
	img.src = getCardImagePath(card);
	img.alt = label;
	img.draggable = false;
	return img;
}

function getCardImagePath(card: Card): string {
	if (card.type === "Joker") {
		return card.color === "RED" ? "/cards/Joker1.png" : "/cards/Joker2.png";
	}

	if (card.type === "Playing") {
		const suitMap: Record<string, string> = {
			h: "hearts",
			d: "diamonds",
			c: "clubs",
			s: "spades",
		};
		const rankMap: Record<number, string> = {
			1: "ace",
			11: "jack",
			12: "queen",
			13: "king",
		};
		const rank = rankMap[card.rank] || String(card.rank).padStart(2, "0");
		return `/cards/${suitMap[card.suit]}_${rank}.png`;
	}

	return "/cards/back01.png";
}

// ─────────────────────────────────────────────
// MARK: Action Buttons
// ─────────────────────────────────────────────

function renderActionButtons(): void {
	const container = document.querySelector("#action-buttons") as HTMLElement;
	if (!container) return;
	container.innerHTML = "";

	const game = gs.room.game;
	if (!game) return;

	const isTurn = isPlayersTurn();

	switch (game.phase) {
		case GamePhase.FINISHED: {
			if (!isHost()) break;

			const needsPlayers = gs.room.players.size !== 3;
			const startBtn = makeBtn(
				needsPlayers ? "Need 3 Players" : "Start Game",
				"action-btn btn-start-game",
				handleStartGame,
			);
			startBtn.disabled = needsPlayers;
			container.append(startBtn);
			break;
		}

		case GamePhase.BIDDING: {
			const currentBet = game.bet ?? 0;

			const bid1 = makeBtn("1", "action-btn btn-bid-1", () =>
				handleBid(1),
			);
			const bid2 = makeBtn("2", "action-btn btn-bid-2", () =>
				handleBid(2),
			);
			const bid3 = makeBtn("3", "action-btn btn-bid-3", () =>
				handleBid(3),
			);
			const pass = makeBtn("Pass", "action-btn btn-bid-pass", () =>
				handleBid(0),
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

			const playBtn = makeBtn(
				"Play",
				"action-btn btn-play",
				handlePlayCards,
			);
			const passBtn = makeBtn(
				"Pass",
				"action-btn btn-pass-game",
				handlePass,
			);
			passBtn.disabled = !canPass();

			container.append(playBtn, passBtn);
			break;
		}
	}
}

function makeBtn(
	label: string,
	className: string,
	onClick: () => void,
): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.className = `btn-white-transparent ${className}`;
	btn.textContent = label;
	btn.addEventListener("click", onClick);
	return btn;
}

// ─────────────────────────────────────────────
// MARK: Game Info (sidebar)
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// MARK: Chat
// ─────────────────────────────────────────────

export function updateUIAllChat(): void {
	const panel = document.querySelector("#chat-messages");
	if (!panel) return;
	panel.innerHTML = "";
	for (const group of groupChatMessages(gs.room.chat.messages))
		panel.append(createChatGroupElement(group));
	panel.scrollTop = panel.scrollHeight;
}

export function updateUIPushChat(message: ChatMessage): void {
	const panel = document.querySelector("#chat-messages");
	if (!panel) return;

	const lastGroup = panel.lastElementChild as HTMLElement | null;
	if (lastGroup?.dataset.senderId === message.id) {
		appendChatMessageToGroup(lastGroup, message);
		panel.scrollTop = panel.scrollHeight;
		return;
	}

	panel.append(createChatGroupElement([message]));
	panel.scrollTop = panel.scrollHeight;
}

function groupChatMessages(messages: ChatMessage[]): ChatMessage[][] {
	const groups: ChatMessage[][] = [];
	for (const message of messages) {
		const previousGroup = groups[groups.length - 1];
		const previousMessage = previousGroup?.[previousGroup.length - 1];
		if (previousMessage?.id === message.id) {
			previousGroup.push(message);
		} else {
			groups.push([message]);
		}
	}
	return groups;
}

function createChatGroupElement(messages: ChatMessage[]): HTMLDivElement {
	const firstMessage = messages[0];
	const group = document.createElement("div");
	group.className =
		`chat-message ${firstMessage.id === gs.player.id ? "own" : ""} ${firstMessage.id === "server" ? "server" : ""}`.trim();
	group.dataset.senderId = firstMessage.id;

	const sender = document.createElement("div");
	sender.className = "chat-sender";
	sender.textContent = getChatSenderName(firstMessage.id);
	group.append(sender);

	const body = document.createElement("div");
	body.className = "chat-message-body";
	for (const message of messages) {
		const line = document.createElement("div");
		line.className = "chat-text";
		line.textContent = message.message;
		body.append(line);
	}

	group.append(body);
	return group;
}

function appendChatMessageToGroup(group: HTMLElement, message: ChatMessage): void {
	const body = group.querySelector(".chat-message-body");
	if (!body) return;

	const line = document.createElement("div");
	line.className = "chat-text";
	line.textContent = message.message;
	body.append(line);
}

function getChatSenderName(id: string): string {
	if (id === gs.player.id) return "You";
	if (id === "server") return "Game";
	return gs.room.players.get(id)?.name ?? "Unknown";
}

export function sendChatMessage(sourceInput?: HTMLInputElement): void {
	const input = sourceInput ?? (document.querySelector("#chat-input") as HTMLInputElement);

	const message = input?.value?.trim();
	if (message && message.length > 0) {
		gs.socket.emit("send-chat", message);
		if (input) input.value = "";
	}
}

// ─────────────────────────────────────────────
// MARK: Notification
// ─────────────────────────────────────────────

function showNotification(message: string, duration: number = 3000): void {
	const notification = document.createElement("div");
	notification.className = "notification";
	notification.textContent = message;
	document.body.append(notification);

	setTimeout(() => {
		notification.classList.add("fade-out");
		setTimeout(() => notification.remove(), 300);
	}, duration);
}

// ─────────────────────────────────────────────
// MARK: Start/End Game
// ─────────────────────────────────────────────

export function startGameUI(): void {
	selectedCards.clear();
	updateUIGame();
	showNotification("Game started!");
}

export function endGameUI(): void {
	selectedCards.clear();
	updateUIGame();
}

// ─────────────────────────────────────────────
// MARK: Helpers
// ─────────────────────────────────────────────

function clearGameArea(): void {
	selectedCards.clear();
	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();
	const handArea = document.querySelector("#card-hand-area");
	if (handArea) handArea.innerHTML = "";
	const actionArea = document.querySelector("#action-buttons");
	if (actionArea) actionArea.innerHTML = "";
	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (banner) banner.style.display = "none";
	const msg = document.querySelector("#table-center-message") as HTMLElement;
	if (msg) msg.style.display = "none";
}

function formatCards(cards: Card[]): string {
	return cards
		.map((card) => {
			if (card.type === "Joker")
				return card.color === "BLACK" ? "🃏" : "🃟";
			if (card.type === "Playing") {
				const suitSymbols: Record<string, string> = {
					h: "♥",
					d: "♦",
					c: "♣",
					s: "♠",
				};
				const rankSymbols: Record<number, string> = {
					1: "A",
					11: "J",
					12: "Q",
					13: "K",
				};
				const rank = rankSymbols[card.rank] || card.rank.toString();
				return `${rank}${suitSymbols[card.suit]}`;
			}
			return "?";
		})
		.join(" ");
}

function formatPlayType(type: string): string {
	const typeNames: Record<string, string> = {
		solo: "Single",
		pair: "Pair",
		triple: "Triple",
		triple_with_single: "Triple + Single",
		triple_with_pair: "Triple + Pair",
		straight: "Straight",
		pair_straight: "Pair Straight",
		triple_straight: "Airplane",
		bomb: "Bomb 💣",
		rocket: "Rocket 🚀",
	};
	return typeNames[type] || type;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// ─────────────────────────────────────────────
// MARK: Compat exports (used by card-three-ui imports in client.js)
// ─────────────────────────────────────────────
export function initCardUI(): void {
	/* no-op: cards rendered inline */
}
export function updateCardDisplay(): void {
	renderCardHand();
}
export function getSelectedCardsFromUI(): Card[] {
	return getSelectedCardObjects();
}
export function clearCardSelection(): void {
	selectedCards.clear();
	renderCardHand();
}
export function disposeCardUI(): void {
	clearGameArea();
}
