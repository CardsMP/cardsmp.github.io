import type { Card } from "@shared/card";

export const selectedCardKeys: Set<string> = new Set();
let preMoveEnabled = false;

export function getCardKey(card: Card): string {
	return card.uid ? `Card:${card.uid}` : `Card:${card.suit}:${card.rank}`;
}

export function isPreMoveEnabled(): boolean {
	return preMoveEnabled;
}

export function setPreMoveEnabled(enabled: boolean): void {
	preMoveEnabled = enabled;
}

export function togglePreMoveEnabled(): boolean {
	preMoveEnabled = !preMoveEnabled;
	return preMoveEnabled;
}
