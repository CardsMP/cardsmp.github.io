import type { Card } from "@shared/card";

export const selectedCardKeys: Set<string> = new Set();

export function getCardKey(card: Card): string {
	if (card.type === "Playing") {
		return card.uid
			? `Playing:${card.uid}`
			: `Playing:${card.suit}:${card.rank}`;
	}
	return card.uid ? `Joker:${card.uid}` : `Joker:${card.color}`;
}
