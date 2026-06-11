import { JOKER_RANK, type Card, type Suit } from "./card";
import type { SerializedPlayer } from "./player";
import { Player } from "./player";

const PLAYERS_FOR_DOUBLE_DECK = 4;
const THREE_PLAYER_CARDS_PER_PLAYER = 17;
const FOUR_PLAYER_CARDS_PER_PLAYER = 25;
const PLAYING_SUITS: Suit[] = ["h", "d", "c", "s"];
const PLAYING_RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

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

	serialize(toIndex?: number): SerializedGame {
		return {
			bottom: this.bottom,
			biddingTurns: this.biddingTurns,
			currentIndex: this.currentIndex,
			lastPlay: this.lastPlay,
			phase: this.phase,
			players: this.players.map((player) => player.serialize()),
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
		const deckCount =
			this.players.length === PLAYERS_FOR_DOUBLE_DECK ? 2 : 1;

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
		const isFourPlayerGame =
			this.players.length === PLAYERS_FOR_DOUBLE_DECK;
		const bottomCardCount = isFourPlayerGame ? 4 : 3;
		const cardsPerPlayer = isFourPlayerGame
			? FOUR_PLAYER_CARDS_PER_PLAYER
			: THREE_PLAYER_CARDS_PER_PLAYER;
		let cardIndex = bottomCardCount;
		const bottomCards = this.bottom.slice(0, bottomCardCount);

		for (const player of this.players) player.hand = new Hand([]);
		for (let index = 0; index < cardsPerPlayer; index++) {
			for (const player of this.players)
				player.hand.cards.push(this.bottom[cardIndex++]);
		}

		for (const player of this.players) player.hand.sort();
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
				const playType = Game.validatePlayType(cards);
				player.hand.remove(cards, false);
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
			const playType = Game.validatePlayType(cards);
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
			this.lastPlay = play;

			if (player.hand.cards.length === 0) {
				this.phase = GamePhase.FINISHED;
				return true;
			}
		}

		// Move to next player logic
		this.currentIndex = (this.currentIndex + 1) % this.players.length;

		if (this.lastPlay && this.lastPlay.playerIndex === this.currentIndex)
			this.lastPlay = undefined;

		return false;
	}

	static validatePlayType(
		cards: Card[],
	): { type: PlayType; value: number } | undefined {
		if (cards.length === 0) return undefined;

		const sorted = [...cards].sort(
			(a, b) => Hand.getCardValue(a) - Hand.getCardValue(b),
		);

		// Big Rocket: 4 Jokers
		if (sorted.length === 4 && sorted.every((c) => c.rank === JOKER_RANK)) {
			return {
				type: PlayType.BIG_ROCKET,
				value: 1001,
			};
		}

		// Rocket: Both Jokers
		if (
			sorted.length === 2 &&
			sorted[0].rank === 14 &&
			sorted[1].rank === 14 &&
			sorted[0].suit !== sorted[1].suit
		) {
			return {
				type: PlayType.ROCKET,
				value: 1000,
			};
		}

		const rankCounts = Game.countRanks(sorted);
		const counts = Object.values(rankCounts);
		const uniqueRanks = Object.keys(rankCounts).map(Number);

		// Bombs (bigger bombs beat smaller ones, higher ranks beat lower ranks):
		if (sorted.length === 8 && counts.length === 1 && counts[0] === 8) {
			return {
				type: PlayType.BOMB,
				value: sorted.length * 20 + Hand.getCardValue(sorted[0]),
			};
		}

		// Solo
		if (sorted.length === 1) {
			return {
				type: PlayType.SOLO,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Pair
		if (sorted.length === 2 && counts.length === 1 && counts[0] === 2) {
			return {
				type: PlayType.PAIR,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Triple
		if (sorted.length === 3 && counts.length === 1 && counts[0] === 3) {
			return {
				type: PlayType.TRIPLE,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Triple with single
		if (
			sorted.length === 4 &&
			counts.length === 2 &&
			counts.includes(3) &&
			counts.includes(1)
		) {
			const tripleRank = uniqueRanks.find((r) => rankCounts[r] === 3)!;
			return {
				type: PlayType.TRIPLE_WITH_SINGLE,
				value: Hand.getCardValue(sorted.find((c) => c.rank === tripleRank)!),
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
				value: Hand.getCardValue(sorted.find((c) => c.rank === tripleRank)!),
			};
		}

		// Straight: 5+ consecutive cards
		if (sorted.length >= 5 && Game.isStraight(sorted, 1)) {
			return {
				type: PlayType.STRAIGHT,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		// Pair straight: 3+ consecutive pairs
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

		// Airplane
		if (Game.isAirplane(sorted, rankCounts)) {
			return {
				type: PlayType.AIRPLANE,
				value: Hand.getCardValue(sorted[0]),
			};
		}

		return undefined;
	}

	private static countRanks(cards: Card[]): Record<number, number> {
		const counts: Record<number, number> = {};
		for (const card of cards) {
			counts[card.rank] = (counts[card.rank] || 0) + 1;
		}
		return counts;
	}

	private static isStraight(sorted: Card[], groupSize: number): number {
		if (sorted.length % groupSize !== 0) return 0;

		for (const card of sorted) {
			if (card.rank === 2) return 0;
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

				if (actualValue !== expectedValue - 1) return 0;
			}
		}

		return numberGroups >= (groupSize === 1 ? 5 : groupSize === 2 ? 3 : 2)
			? numberGroups
			: 0;
	}

	static isAirplane(
		cards: Card[],
		rankCounts: Record<number, number>,
	): boolean {
		// find all of the ones with length 3, separate it out and plug into isStraight
		let triples: Card[] = [];
		for (const rank in rankCounts) {
			if (rankCounts[rank] === 3) {
				triples.push(...cards.filter((c) => c.rank === Number(rank)));
			}
		}

		if (!Game.isStraight(triples, 3)) return false;

		// if number of ranks is not 2 or the other rank is not 1 or 2
		if (
			Object.keys(rankCounts).length !== 2 ||
			!Object.values(rankCounts).some(
				(count) => count === 1 || count === 2,
			)
		) {
			return false;
		}

		return false;
	}

	static canBeat(play: Play, lastPlay: Play): boolean {
		// Big Rocket beats everything
		if (play.type === PlayType.BIG_ROCKET) return true;

		// Rocket beats everything except Big Rocket
		if (play.type === PlayType.ROCKET) {
			if (lastPlay.type === PlayType.BIG_ROCKET) return false;
			return true;
		}

		// Bomb beats everything except Rocket and higher Bombs
		if (play.type === PlayType.BOMB) {
			if (lastPlay.type === PlayType.ROCKET) return false;
			if (lastPlay.type === PlayType.BOMB)
				return play.value > lastPlay.value;

			return true;
		}

		// Normal plays must match type and have higher value
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
		if (card.rank === 14) {
			return card.suit === "Black Joker" ? 53 : 54;
		} else {
			return card.rank === 2 ? 20 : card.rank === 1 ? 14 : card.rank;
		}
	}

	remove(cards: Card[], check = true): void {
		for (const card of cards) {
			const index = this.cards.findIndex((c) => Hand.cardsEqual(c, card));
			if (index !== -1 || !check) this.cards.splice(index, 1);
		}
	}

	static cardsEqual(a: Card, b: Card): boolean {
		if (a.uid !== undefined || b.uid !== undefined) return a.uid === b.uid;

		return a.suit === b.suit && a.rank === b.rank;

		return false;
	}
}
