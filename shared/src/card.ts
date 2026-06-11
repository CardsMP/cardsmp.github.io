// Jokers are 20 Rank, other cards are 3-13 (3-10, J=11, Q=12, K=13, A=14, 2=16)

export type Suit = "h" | "d" | "c" | "s" | "Red Joker" | "Black Joker";
export const TWO_RANK: number = 16;
export const JOKER_RANK: number = 20;

export type Card = {
	suit: Suit;
	rank: number;
	uid?: string;
};

export function cardToString(card: Card): string {
	if (card.rank === JOKER_RANK) return card.suit;

	const rankMap: Record<number, string> = {
		14: "A",
		[1]: "A",
		11: "J",
		12: "Q",
		13: "K",
		[TWO_RANK]: "2",
		2: "2",
	};
	const suitMap: Record<string, string> = {
		h: "♥",
		d: "♦",
		c: "♣",
		s: "♠",
	};
	const rank = rankMap[card.rank] ?? String(card.rank);
	const suit = suitMap[card.suit] ?? "";
	return `${rank}${suit}`;
}
