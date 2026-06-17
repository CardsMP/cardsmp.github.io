import type { Card } from "@shared/card";
import { GamePhase } from "@shared/game";
import { MAX_ROOM_PLAYERS } from "@shared/room";
import { renderCardHand } from "./game-ui-cards";
import {
	getLocalGamePlayer,
	getLocalGamePlayerIndex,
} from "./game-ui-local-player";
import { gs } from "./session";
import {
	clearPreMoveState,
	getCardKey,
	getPreMoveBet,
	isPreMoveEnabled,
	selectedCardKeys,
	setPreMoveBet,
	togglePreMoveEnabled,
} from "./game-ui-state";
import { makeBtn } from "./game-ui-utils";

export function isPlayersTurn(): boolean {
	const playerIndex = getLocalGamePlayerIndex();
	return (
		playerIndex !== undefined && playerIndex === gs.room?.game?.currentIndex
	);
}

export function canPass(): boolean {
	const game = gs.room?.game;
	const playerIndex = getLocalGamePlayerIndex();
	return (
		game?.phase === GamePhase.PLAYING &&
		playerIndex !== undefined &&
		!!game.lastPlay &&
		game.lastPlay.playerIndex !== playerIndex
	);
}

export function getSelectedCardObjects(): Card[] {
	const myPlayer = getLocalGamePlayer();
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
	clearPreMoveState();
	return true;
}

export function passTurn(): boolean {
	if (!isPlayersTurn() || !canPass()) return false;

	gs.socket.emit("play-cards", []);
	selectedCardKeys.clear();
	clearPreMoveState();
	return true;
}

export function betLandlord(bet: number): boolean {
	if (!isPlayersTurn() || !canBetLandlord(bet)) return false;

	gs.socket.emit("bet-landlord", bet);
	clearPreMoveState();
	return true;
}

export function tryPreMoveCurrentTurn(): boolean {
	if (!isPlayersTurn()) return false;

	const game = gs.room?.game;
	if (game?.phase !== GamePhase.BIDDING && getPreMoveBet() !== undefined)
		setPreMoveBet(undefined);

	if (game?.phase === GamePhase.BIDDING) {
		const bet = getPreMoveBet();
		if (bet === undefined) return false;
		if (!canBetLandlord(bet)) {
			setPreMoveBet(undefined);
			return false;
		}

		return betLandlord(bet);
	}

	if (!isPreMoveEnabled()) return false;
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
			clearInvalidPreMoveBet(currentBet);

			const bid1 = createBetButton(1, currentBet, isTurn);
			const bid2 = createBetButton(2, currentBet, isTurn);
			const bid3 = createBetButton(3, currentBet, isTurn);
			const pass = createBetButton(0, currentBet, isTurn);

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

function createBetButton(
	bet: number,
	currentBet: number,
	isTurn: boolean,
): HTMLButtonElement {
	const label = getBetButtonLabel(bet, isTurn);
	const preMoveClass = isTurn ? "" : "btn-preplay";
	const betBtn = makeBtn(label, preMoveClass, () => {
		if (isTurn) {
			betLandlord(bet);
			return;
		}

		togglePreMoveBet(bet);
		renderActionButtons();
	});

	betBtn.disabled = !isBetOptionAvailable(bet, currentBet);

	if (!isTurn) {
		const enabled = getPreMoveBet() === bet;
		betBtn.classList.toggle("is-active", enabled);
		betBtn.setAttribute("aria-pressed", String(enabled));
	}

	return betBtn;
}

function getBetButtonLabel(bet: number, isTurn: boolean): string {
	if (bet === 0) return isTurn ? "Pass" : "Pre-pass";
	return isTurn ? String(bet) : `Pre-${bet}`;
}

function togglePreMoveBet(bet: number): void {
	setPreMoveBet(getPreMoveBet() === bet ? undefined : bet);
}

function clearInvalidPreMoveBet(currentBet: number): void {
	const bet = getPreMoveBet();
	if (bet !== undefined && !isBetOptionAvailable(bet, currentBet))
		setPreMoveBet(undefined);
}

function canBetLandlord(bet: number): boolean {
	const game = gs.room?.game;
	if (game?.phase !== GamePhase.BIDDING) return false;
	return isBetOptionAvailable(bet, game.bet ?? 0);
}

function isBetOptionAvailable(bet: number, currentBet: number): boolean {
	return bet === 0 || bet > currentBet;
}

function isCurrentPlayerInRound(): boolean {
	return !!getLocalGamePlayer();
}
