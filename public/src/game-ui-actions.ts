import type { Card } from "@shared/card";
import { GamePhase } from "@shared/game";
import { MAX_ROOM_PLAYERS } from "@shared/room";
import { renderCardHand } from "./game-ui-cards";
import { gs } from "./session";
import {
	getCardKey,
	isPreMoveEnabled,
	selectedCardKeys,
	setPreMoveEnabled,
	togglePreMoveEnabled,
} from "./game-ui-state";
import { makeBtn } from "./game-ui-utils";

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

export function renderActionButtons(): void {
	const container = document.querySelector("#action-buttons") as HTMLElement;
	if (!container) return;
	container.innerHTML = "";

	const game = gs.room?.game;
	if (!game || !gs.room) return;

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
					renderCardHand(renderActionButtons);
					renderActionButtons();
				}
			});
			const passBtn = makeBtn("Pass", "", () => {
				if (passTurn()) {
					renderCardHand(renderActionButtons);
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

export function runReadyPreMove(): void {
	if (!tryPreMoveCurrentTurn()) return;
	renderCardHand(renderActionButtons);
	renderActionButtons();
}

function createPreMoveButton(): HTMLButtonElement {
	const hasSelectedCards = getSelectedCardObjects().length > 0;
	const label = hasSelectedCards ? "Pre-play" : "Pre-pass";

	const preMoveBtn = makeBtn(label, "btn-preplay", () => {
		const enabled = togglePreMoveEnabled();
		if (enabled && tryPreMoveCurrentTurn()) {
			renderCardHand(renderActionButtons);
		}
		renderActionButtons();
	});
	const enabled = isPreMoveEnabled();
	preMoveBtn.classList.toggle("is-active", enabled);
	preMoveBtn.setAttribute("aria-pressed", String(enabled));
	return preMoveBtn;
}

function isCurrentPlayerInRound(): boolean {
	return !!gs.room?.game.players.some(
		(gamePlayer) => gamePlayer.id === gs.player.id,
	);
}
