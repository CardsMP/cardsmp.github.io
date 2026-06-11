import { JOKER_RANK, TWO_RANK, type Card, type Suit } from "./card";
import type { SerializedPlayer } from "./player";
import { Player } from "./player";

const PLAYERS_FOR_DOUBLE_DECK = 4;
const THREE_PLAYER_CARDS_PER_PLAYER = 17;
const FOUR_PLAYER_CARDS_PER_PLAYER = 25;
const THREE_PLAYER_BOTTOM_COUNT = 3;
const FOUR_PLAYER_BOTTOM_COUNT = 8;
const PLAYING_SUITS: Suit[] = ["h", "d", "c", "s"];
const PLAYING_RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, TWO_RANK];

export interface SerializedGame {
	bottom: Card[];
	biddingTurns: number;
	currentIndex: number;
	lastPlay: Play | undefined;
	phase: GamePhase;
	players: SerializedPlayer[];
	bet: number;
	landlordIndex: number | undefined;
}

export class Game {
	bottom: Card[] = [];
	players: Player[] = [];
	currentIndex: number = 0;
	biddingTurns: number = 0;
	bet: number = 0;
	landlordIndex: number | undefined = undefined;
	lastPlay: Play | undefined = undefined;
	phase: GamePhase = GamePhase.FINISHED;

	constructor() {}

	get isDoubleDeck(): boolean {
		return this.players.length === PLAYERS_FOR_DOUBLE_DECK;
	}

	serialize(viewerId?: string): SerializedGame {
		return {
			bottom: this.bottom,
			biddingTurns: this.biddingTurns,
			currentIndex: this.currentIndex,
			lastPlay: this.lastPlay,
			phase: this.phase,
			players: this.players.map((player) => player.serialize(viewerId)),
			bet: this.bet,
			landlordIndex: this.landlordIndex,
		};
	}

	static deserialize(data: SerializedGame): Game {
		const game = new Game();
		game.bottom = data.bottom;
		game.biddingTurns = data.biddingTurns ?? 0;
		game.currentIndex = data.currentIndex;
		game.lastPlay = data.lastPlay;
		game.phase = data.phase;
		game.players = data.players.map((p) => Player.deserialize(p));
		game.bet = data.bet;
		game.landlordIndex = data.landlordIndex;
		return game;
	}

	get current(): Player {
		return this.players[this.currentIndex];
	}

	get landlord(): Player | undefined {
		if (this.landlordIndex === undefined) return undefined;
		return this.players[this.landlordIndex];
	}

	// Server Only
	startGame(players: Player[]): void {
		this.players = [...players];

		for (const [index, player] of this.players.entries())
			player.index = index;

		this.initializeDeck();
		this.shuffleDeck();
		this.dealCards();
		this.phase = GamePhase.BIDDING;
		this.currentIndex = 0;
		this.biddingTurns = 0;
		this.bet = 0;
		this.landlordIndex = undefined;
		this.lastPlay = undefined;
	}

	// Server Only
	private initializeDeck(): void {
		this.bottom = [];
		const deckCount = this.isDoubleDeck ? 2 : 1;

		for (let deckIndex = 0; deckIndex < deckCount; deckIndex++) {
			for (const suit of PLAYING_SUITS) {
				for (const rank of PLAYING_RANKS) {
					this.bottom.push({
						suit,
						rank,
						uid: `deck${deckIndex}-${suit}${rank}`,
					});
				}
			}

			this.bottom.push(
				{
					rank: JOKER_RANK,
					suit: "Black Joker",
					uid: `deck${deckIndex}-joker-black`,
				},
				{
					rank: JOKER_RANK,
					suit: "Red Joker",
					uid: `deck${deckIndex}-joker-red`,
				},
			);
		}
	}

	// Server Only
	private shuffleDeck(): void {
		for (let index = this.bottom.length - 1; index > 0; index--) {
			const index_ = Math.floor(Math.random() * (index + 1));
			[this.bottom[index], this.bottom[index_]] = [
				this.bottom[index_],
				this.bottom[index],
			];
		}
	}

	// Server Only
	private dealCards(): void {
		const bottomCardCount = this.isDoubleDeck
			? FOUR_PLAYER_BOTTOM_COUNT
			: THREE_PLAYER_BOTTOM_COUNT;
		const cardsPerPlayer = this.isDoubleDeck
			? FOUR_PLAYER_CARDS_PER_PLAYER
			: THREE_PLAYER_CARDS_PER_PLAYER;
		let cardIndex = bottomCardCount;
		const bottomCards = this.bottom.slice(0, bottomCardCount);

		for (const player of this.players) player.hand = new Hand([]);
		for (let index = 0; index < cardsPerPlayer; index++) {
			for (const player of this.players)
				player.hand.cards.push(this.bottom[cardIndex++]);
		}

		for (const player of this.players) {
			player.hand.sort();
			player.handCount = player.hand.cards.length;
		}
		this.bottom = bottomCards;
	}

	betLandlord(bet: number): boolean | undefined {
		if (this.phase !== GamePhase.BIDDING) return undefined;
		if (bet < 0 || bet > 3 || (bet <= this.bet && bet !== 0))
			return undefined;

		this.biddingTurns++;

		if (bet > this.bet) {
			this.bet = bet;
			this.landlordIndex = this.currentIndex;
			if (bet === 3) return true;
		}

		this.currentIndex = (this.currentIndex + 1) % this.players.length;

		if (this.landlordIndex !== undefined)
			return this.currentIndex === this.landlordIndex;

		if (this.biddingTurns >= this.players.length) {
			this.landlordIndex = 0;
			this.currentIndex = 0;
			this.bet = 1;
			return true;
		}

		return false;
	}

	becomeLandlord(bottom = this.bottom): void {
		if (this.phase !== GamePhase.BIDDING) return;
		if (this.landlordIndex === undefined)
			this.landlordIndex = this.currentIndex;

		const player = this.players[this.landlordIndex];

		player.hand.cards.push(...bottom);
		player.hand.sort();
		player.handCount = player.hand.cards.length;

		this.bottom = [];
		this.phase = GamePhase.PLAYING;
		this.currentIndex = this.landlordIndex;
		this.lastPlay = undefined;
	}

	playCards(cards: Card[], check = true): boolean | undefined {
		if (this.phase !== GamePhase.PLAYING) return undefined;

		const player = this.players[this.currentIndex];

		if (cards.length === 0 && !this.lastPlay) return undefined;

		if (!check) {
			if (cards.length > 0) {
				const playType = Game.validatePlayType(
					cards,
					this.isDoubleDeck,
				);
				player.hand.remove(cards, false);
				player.handCount = player.hand.cards.length;
				this.lastPlay = {
					cards,
					type: playType?.type ?? PlayType.SOLO,
					value: playType?.value ?? 0,
					playerIndex: this.currentIndex,
				};
			}
			this.currentIndex = (this.currentIndex + 1) % this.players.length;

			if (
				this.lastPlay &&
				this.lastPlay.playerIndex === this.currentIndex
			)
				this.lastPlay = undefined;

			return player.hand.cards.length === 0;
		}

		if (cards.length > 0) {
			const playType = Game.validatePlayType(cards, this.isDoubleDeck);
			if (!playType) return undefined;

			const play = {
				cards,
				type: playType.type,
				value: playType.value,
				playerIndex: this.currentIndex,
			};

			if (this.lastPlay && !Game.canBeat(play, this.lastPlay))
				return undefined;

			player.hand.remove(cards, check);
			player.handCount = player.hand.cards.length;
			this.lastPlay = play;

			if (player.hand.cards.length === 0) {
				this.phase = GamePhase.FINISHED;
				return true;
			}
		}

		this.currentIndex = (this.currentIndex + 1) % this.players.length;

		if (this.lastPlay && this.lastPlay.playerIndex === this.currentIndex)
			this.lastPlay = undefined;

		return false;
	}

	static validatePlayType(
		cards: Card[],
		doubleDeck = false,
	): { type: PlayType; value: number } | undefined {
		if (cards.length === 0) return undefined;

		const sorted = [...cards].sort(
			(a, b) => Hand.getCardValue(a) - Hand.getCardValue(b),
		);

		// 4-player rocket: all four jokers
		if (
			doubleDeck &&
			sorted.length === 4 &&
			sorted.every((c) => c.rank === JOKER_RANK)
		) {
			return { type: PlayType.BIG_ROCKET, value: 1001 };
		}

		// 3-player rocket: one black joker + one red joker
		if (
			!doubleDeck &&
			sorted.length === 2 &&
			sorted[0].rank === JOKER_RANK &&
			sorted[1].rank === JOKER_RANK &&
			sorted[0].suit !== sorted[1].suit
		) {
			return { type: PlayType.ROCKET, value: 1000 };
		}

		const rankCounts = Game.countRanks(sorted);
		const counts = Object.values(rankCounts);
		const uniqueRanks = Object.keys(rankCounts).map(Number);

		// Bomb: 4-of-kind in 3-player; 4-or-more-of-kind in 4-player.
		// More cards always beats fewer cards regardless of rank, so value scales by length first.
		const minBombSize = 4;
		const maxBombSize = doubleDeck ? 8 : 4;
		if (
			counts.length === 1 &&
			sorted.length >= minBombSize &&
			sorted.length <= maxBombSize &&
			sorted.length % 1 === 0
		) {
			return {
				type: PlayType.BOMB,
				value: sorted.length * 1000 + Hand.getCardValue(sorted[0]),
			};
		}

		// Solo
		if (sorted.length === 1) {
			return { type: PlayType.SOLO, value: Hand.getCardValue(sorted[0]) };
		}

		// Pair (including matched joker pairs in 4-player)
		if (sorted.length === 2 && counts.length === 1 && counts[0] === 2) {
			return { type: PlayType.PAIR, value: Hand.getCardValue(sorted[0]) };
		}

		// Triple
		if (sorted.length === 3 && counts.length === 1 && counts[0] === 3) {
			return {
				type: PlayType.TRIPLE,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Triple with single (3-player only)
		if (
			!doubleDeck &&
			sorted.length === 4 &&
			counts.length === 2 &&
			counts.includes(3) &&
			counts.includes(1)
		) {
			const tripleRank = uniqueRanks.find((r) => rankCounts[r] === 3)!;
			return {
				type: PlayType.TRIPLE_WITH_SINGLE,
				value: Hand.getCardValue(
					sorted.find((c) => c.rank === tripleRank)!,
				),
			};
		}

		// Triple with pair
		if (
			sorted.length === 5 &&
			counts.length === 2 &&
			counts.includes(3) &&
			counts.includes(2)
		) {
			const tripleRank = uniqueRanks.find((r) => rankCounts[r] === 3)!;
			return {
				type: PlayType.TRIPLE_WITH_PAIR,
				value: Hand.getCardValue(
					sorted.find((c) => c.rank === tripleRank)!,
				),
			};
		}

		// Quad with 2 singles (3-player only): one quad + exactly 2 singles of different ranks
		if (
			!doubleDeck &&
			sorted.length === 6 &&
			counts.includes(4) &&
			counts.length === 3 &&
			counts.filter((c) => c === 1).length === 2
		) {
			const quadRank = uniqueRanks.find((r) => rankCounts[r] === 4)!;
			return {
				type: PlayType.QUAD_WITH_SINGLES,
				value: Hand.getCardValue(
					sorted.find((c) => c.rank === quadRank)!,
				),
			};
		}

		// Quad with 2 pairs (3-player only): one quad + exactly 2 pairs of different ranks
		if (
			!doubleDeck &&
			sorted.length === 8 &&
			counts.includes(4) &&
			counts.length === 3 &&
			counts.filter((c) => c === 2).length === 2
		) {
			const quadRank = uniqueRanks.find((r) => rankCounts[r] === 4)!;
			return {
				type: PlayType.QUAD_WITH_PAIRS,
				value: Hand.getCardValue(
					sorted.find((c) => c.rank === quadRank)!,
				),
			};
		}

		// Straight: 5+ consecutive singles (no 2s or jokers)
		if (sorted.length >= 5 && Game.isStraight(sorted, 1)) {
			return {
				type: PlayType.STRAIGHT,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Pair straight: 3+ consecutive pairs (no 2s or jokers)
		if (
			sorted.length >= 6 &&
			sorted.length % 2 === 0 &&
			Game.isStraight(sorted, 2)
		) {
			return {
				type: PlayType.PAIR_STRAIGHT,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Triple straight: 2+ consecutive triples, no attachments
		if (
			sorted.length >= 6 &&
			sorted.length % 3 === 0 &&
			counts.every((c) => c === 3) &&
			Game.isStraight(sorted, 3)
		) {
			return {
				type: PlayType.TRIPLE_STRAIGHT,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Airplane: 2+ consecutive triples with attached singles (3-player only) or pairs
		const airplaneResult = Game.validateAirplane(
			sorted,
			rankCounts,
			doubleDeck,
		);
		if (airplaneResult) return airplaneResult;

		return undefined;
	}

	private static countRanks(cards: Card[]): Record<number, number> {
		const counts: Record<number, number> = {};
		for (const card of cards) {
			counts[card.rank] = (counts[card.rank] || 0) + 1;
		}
		return counts;
	}

	// Cards are sorted ascending, so each successive group must be exactly 1 higher in value.
	private static isStraight(sorted: Card[], groupSize: number): number {
		if (sorted.length % groupSize !== 0) return 0;

		for (const card of sorted) {
			if (
				card.rank === 2 ||
				card.rank === TWO_RANK ||
				card.rank === JOKER_RANK
			)
				return 0;
		}

		const numberGroups = sorted.length / groupSize;
		for (let index = 0; index < numberGroups; index++) {
			const groupCards = sorted.slice(
				index * groupSize,
				(index + 1) * groupSize,
			);

			const firstCard = groupCards[0];

			for (const card of groupCards)
				if (card.rank !== firstCard.rank) return 0;

			if (index > 0) {
				const previousCard = sorted[(index - 1) * groupSize];
				const expectedValue = Hand.getCardValue(previousCard);
				const actualValue = Hand.getCardValue(firstCard);

				if (actualValue !== expectedValue + 1) return 0;
			}
		}

		return numberGroups >= (groupSize === 1 ? 5 : groupSize === 2 ? 3 : 2)
			? numberGroups
			: 0;
	}

	// Airplane: 2+ consecutive triples with attached singles (3-player only) or pairs.
	// The triple ranks must form a consecutive sequence. The remaining cards must all be
	// singles (one per triple, all different ranks) or all pairs (one pair per triple, all different ranks).
	static validateAirplane(
		cards: Card[],
		rankCounts: Record<number, number>,
		doubleDeck = false,
	): { type: PlayType; value: number } | undefined {
		const tripleRanks = Object.keys(rankCounts)
			.map(Number)
			.filter((r) => rankCounts[r] === 3);

		if (tripleRanks.length < 2) return undefined;

		const tripleCards = cards.filter((c) => tripleRanks.includes(c.rank));
		const tripleSorted = [...tripleCards].sort(
			(a, b) => Hand.getCardValue(a) - Hand.getCardValue(b),
		);

		if (!Game.isStraight(tripleSorted, 3)) return undefined;

		const attachmentCards = cards.filter(
			(c) => !tripleRanks.includes(c.rank),
		);
		const numTriples = tripleRanks.length;

		if (attachmentCards.length === 0) return undefined;

		// Attached singles (excluded in 4-player): one card per triple, all different ranks
		if (!doubleDeck && attachmentCards.length === numTriples) {
			const attachmentRanks = attachmentCards.map((c) => c.rank);
			if (new Set(attachmentRanks).size !== numTriples) return undefined;

			return {
				type: PlayType.AIRPLANE,
				value: Hand.getCardValue(tripleSorted[0]),
			};
		}

		// Attached pairs: one pair per triple, all different ranks
		if (attachmentCards.length === numTriples * 2) {
			const attachmentCounts = Game.countRanks(attachmentCards);
			const allPairs = Object.values(attachmentCounts).every(
				(c) => c === 2,
			);
			if (!allPairs) return undefined;
			if (Object.keys(attachmentCounts).length !== numTriples)
				return undefined;

			return {
				type: PlayType.AIRPLANE,
				value: Hand.getCardValue(tripleSorted[0]),
			};
		}

		return undefined;
	}

	static canBeat(play: Play, lastPlay: Play): boolean {
		if (play.type === PlayType.BIG_ROCKET) return true;

		if (play.type === PlayType.ROCKET) {
			if (lastPlay.type === PlayType.BIG_ROCKET) return false;
			return true;
		}

		if (play.type === PlayType.BOMB) {
			if (
				lastPlay.type === PlayType.ROCKET ||
				lastPlay.type === PlayType.BIG_ROCKET
			)
				return false;
			if (lastPlay.type === PlayType.BOMB)
				return play.value > lastPlay.value;
			return true;
		}

		if (play.type !== lastPlay.type) return false;
		if (play.cards.length !== lastPlay.cards.length) return false;

		return play.value > lastPlay.value;
	}
}

export enum GamePhase {
	BIDDING = "bidding",
	PLAYING = "playing",
	FINISHED = "finished",
}

export enum PlayType {
	SOLO = "solo",
	PAIR = "pair",
	TRIPLE = "triple",
	TRIPLE_WITH_SINGLE = "triple_with_single",
	TRIPLE_WITH_PAIR = "triple_with_pair",
	STRAIGHT = "straight",
	PAIR_STRAIGHT = "pair_straight",
	TRIPLE_STRAIGHT = "triple_straight",
	AIRPLANE = "airplane",
	QUAD_WITH_SINGLES = "quad_with_singles",
	QUAD_WITH_PAIRS = "quad_with_pairs",
	BOMB = "bomb",
	ROCKET = "rocket",
	BIG_ROCKET = "big_rocket",
}

export interface Play {
	cards: Card[];
	type: PlayType;
	value: number;
	playerIndex: number;
}

export class Hand {
	cards: Card[] = [];

	constructor(cards: Card[]) {
		this.cards = cards;
	}

	sort(): void {
		this.cards.sort((a, b) => {
			const aValue = Hand.getCardValue(a);
			const bValue = Hand.getCardValue(b);
			return aValue - bValue;
		});
	}

	static getCardValue(card: Card): number {
		if (card.rank === JOKER_RANK)
			return card.suit === "Black Joker" ? 53 : 54;

		if (card.rank === 2 || card.rank === TWO_RANK) return 20;
		if (card.rank === 1 || card.rank === 14) return 14;

		return card.rank;
	}

	remove(cards: Card[], check = true): void {
		for (const card of cards) {
			const index = this.cards.findIndex((c) => Hand.cardsEqual(c, card));
			if (index !== -1) this.cards.splice(index, 1);
		}
	}

	static cardsEqual(a: Card, b: Card): boolean {
		if (a.uid !== undefined || b.uid !== undefined) return a.uid === b.uid;
		return a.suit === b.suit && a.rank === b.rank;
	}
}
