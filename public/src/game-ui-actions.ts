import type { Card } from "@shared/card";
import { GamePhase } from "@shared/game";
import { gs } from "./session";
import {
	getCardKey,
	isPreMoveEnabled,
	selectedCardKeys,
	setPreMoveEnabled,
} from "./game-ui-state";

export function isPlayersTurn(): boolean {
	return gs.player?.index === gs.room?.game?.currentIndex;
}

export function canPass(): boolean {
	const game = gs.room?.game;
	return (
		game?.phase === GamePhase.PLAYING &&
		!!game.lastPlay &&
		game.lastPlay.playerIndex !== gs.player?.index
	);
}

export function getSelectedCardObjects(): Card[] {
	const playerIndex = gs.player?.index;
	if (playerIndex === undefined) return [];

	const myPlayer = gs.room?.game?.players[playerIndex];
	if (!myPlayer) return [];

	return myPlayer.hand.cards.filter((card) =>
		selectedCardKeys.has(getCardKey(card)),
	);
}

export function playSelectedCards(): boolean {
	if (!isPlayersTurn()) return false;

	const cards = getSelectedCardObjects();
	if (cards.length === 0) return false;

	gs.socket.emit("play-cards", cards);
	selectedCardKeys.clear();
	setPreMoveEnabled(false);
	return true;
}

export function passTurn(): boolean {
	if (!isPlayersTurn() || !canPass()) return false;

	gs.socket.emit("play-cards", []);
	selectedCardKeys.clear();
	setPreMoveEnabled(false);
	return true;
}

export function tryPreMoveCurrentTurn(): boolean {
	if (!isPreMoveEnabled() || !isPlayersTurn()) return false;
	if (getSelectedCardObjects().length === 0) return passTurn();

	return playSelectedCards();
}
