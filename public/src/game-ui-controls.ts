import { GamePhase } from "@shared/game";
import { gs } from "./session";
import { renderCardHand } from "./game-ui-render";
import { getCardKey, selectedCardKeys } from "./game-ui-state";
import { sendChatMessage } from "./game-ui-chat";

function handlePlayCards(): void {
	if (!isPlayersTurn()) return;

	const cards = getSelectedCardObjects();
	if (cards.length === 0) {
		return;
	}

	gs.socket.emit("play-cards", cards);
	selectedCardKeys.clear();
	renderCardHand();
}

function handlePass(): void {
	if (!isPlayersTurn()) return;
	if (!canPass()) {
		return;
	}

	gs.socket.emit("play-cards", []);
	selectedCardKeys.clear();
	renderCardHand();
}

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

function getSelectedCardObjects() {
	const myPlayer = gs.room.game.players[gs.player.index ?? 0];
	if (!myPlayer) return [];

	return myPlayer.hand.cards.filter((card) =>
		selectedCardKeys.has(getCardKey(card)),
	);
}

export function initGameControls(): void {
	const chatInput = document.querySelector("#chat-input") as HTMLInputElement;
	chatInput?.addEventListener("keydown", (e: Event) => {
		const ke = e as KeyboardEvent;
		e.stopPropagation();
		if (ke.key === "Enter") {
			ke.preventDefault();
			sendChatMessage(chatInput);
		}
	});

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
