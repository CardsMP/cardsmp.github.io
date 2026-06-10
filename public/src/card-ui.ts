import type { Card } from "@shared/card";
import type { Game } from "@shared/game";
import { gs } from "./session";

type CardElement = HTMLElement & {
	card: Card;
	index: number;
	seat: number;
	selected: boolean;
	hovered: boolean;
};

export class CardUI {
	private container: HTMLElement;
	private cardEls: CardElement[] = [];
	private selectedCards: Set<string> = new Set();
	private tableEl: HTMLElement;
	private onPlay?: (cards: Card[]) => void;
	private onPass?: () => void;

	constructor(
		containerId: string,
		callbacks?: { onPlay?: (cards: Card[]) => void; onPass?: () => void },
	) {
		this.container = document.querySelector(containerId) as HTMLElement;
		this.onPlay = callbacks?.onPlay;
		this.onPass = callbacks?.onPass;
		this.container.innerHTML = "";
		this.container.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            background: radial-gradient(ellipse at center, #1b3a2a 0%, #0d1f16 60%, #080e0b 100%);
            overflow: hidden;
        `;

		// Felt texture overlay
		const felt = document.createElement("div");
		felt.style.cssText = `
            position: absolute; inset: 0; pointer-events: none; z-index: 0;
            background-image: repeating-linear-gradient(
                45deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 8px
            );
        `;
		this.container.append(felt);

		this.tableEl = document.createElement("div");
		this.tableEl.style.cssText = `
            position: absolute; inset: 0; z-index: 2; pointer-events: none;
        `;
		this.container.append(this.tableEl);

		window.addEventListener("resize", () => this.repositionAll());
	}

	private getRelativeSeatIndex(absoluteSeat: number): number {
		const playerGameIndex = gs.player.index;
		const totalPlayers = gs.room.game.players.length;
		if (playerGameIndex === undefined) return absoluteSeat;
		return (absoluteSeat - playerGameIndex + totalPlayers) % totalPlayers;
	}

	private getSeatLayout(
		absoluteSeat: number,
		totalPlayers: number,
	): { cx: number; cy: number; rotation: number; isBottom: boolean } {
		const rel = this.getRelativeSeatIndex(absoluteSeat);

		if (rel === 0) {
			// Current player – bottom center
			return { cx: 0.5, cy: 0.82, rotation: 0, isBottom: true };
		}

		const fixedOpponentLayouts = [
			{ cx: 0.84, cy: 0.4, rotation: -90, isBottom: false },
			{ cx: 0.16, cy: 0.4, rotation: 90, isBottom: false },
			{ cx: 0.5, cy: 0.14, rotation: 180, isBottom: false },
		];

		return fixedOpponentLayouts[rel - 1] ?? fixedOpponentLayouts[0];
	}

	private positionCard(element: CardElement): void {
		const totalPlayers = gs.room.game.players.length || 3;
		const seat = element.seat;
		const handCards = this.cardEls.filter((c) => c.seat === seat);
		const handSize = handCards.length;
		const sortedHand = [...handCards].sort((a, b) => a.index - b.index);
		const positionInHand = sortedHand.findIndex(
			(c) => c.index === element.index,
		);

		const layout = this.getSeatLayout(seat, totalPlayers);
		const cw = this.container.clientWidth;
		const ch = this.container.clientHeight;

		const isBottom = layout.isBottom;

		// Card dimensions: bottom hand larger, opponents smaller
		const cardW = isBottom
			? Math.max(78, Math.min(112, cw * 0.09))
			: Math.max(34, Math.min(58, cw * 0.048));
		const cardH = cardW * 1.4;

		// Overlap spacing – tighter when many cards
		const maxWidth = isBottom ? cw * 0.82 : cw * 0.3;
		const rawSpacing = cardW * 0.48;
		const spacing = Math.min(
			rawSpacing,
			(maxWidth - cardW) / Math.max(handSize - 1, 1),
		);

		const midIndex = (handSize - 1) / 2;
		const offsetI = positionInHand - midIndex;

		const cx = layout.cx * cw;
		const cy = layout.cy * ch;

		const ox = offsetI * spacing;

		const x = cx + ox - cardW / 2;
		const y = cy - cardH / 2;

		const lift = element.selected ? -22 : 0;
		const scale = element.selected ? 1.1 : element.hovered ? 1.05 : 1;
		const baseRot = layout.rotation;

		element.style.width = `${cardW}px`;
		element.style.height = `${cardH}px`;
		element.style.left = `${x}px`;
		element.style.top = `${y + lift}px`;
		element.style.transform = `rotate(${baseRot}deg) scale(${scale})`;
		element.style.transformOrigin = "center center";
		element.style.zIndex = "1";
	}

	private repositionAll(): void {
		for (const element of this.cardEls) this.positionCard(element);
	}

	private getCardImagePath(card: Card): string {
		if (card.type === "Joker") {
			return card.color === "RED"
				? "/cards/Joker1.png"
				: "/cards/Joker2.png";
		} else if (card.type === "Playing") {
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
			const rankString =
				rankMap[card.rank] || String(card.rank).padStart(2, "0");
			return `/cards/${suitMap[card.suit]}_${rankString}.png`;
		}
		return "/cards/back01.png";
	}

	private createCardEl(card: Card, index: number, seat: number): CardElement {
		const element = document.createElement("div") as unknown as CardElement;

		const isOwnCard = gs.player.index === seat;
		const imgSource = isOwnCard
			? this.getCardImagePath(card)
			: "/cards/back01.png";

		element.style.cssText = `
            position: absolute;
            border-radius: 6px;
            cursor: ${isOwnCard ? "pointer" : "default"};
            transition: transform 0.15s ease, top 0.15s ease, box-shadow 0.15s ease;
            box-shadow: 2px 3px 8px rgba(0,0,0,0.5);
            overflow: hidden;
            pointer-events: ${isOwnCard ? "auto" : "none"};
            background: transparent;
        `;

		const img = document.createElement("img");
		img.src = imgSource;
		img.style.cssText =
			"width: 100%; height: 100%; display: block; object-fit: contain;";
		img.draggable = false;
		element.append(img);

		element.card = card;
		element.index = index;
		element.seat = seat;
		element.selected = false;
		element.hovered = false;

		if (isOwnCard) {
			element.addEventListener("click", () => this.onCardClick(element));
			element.addEventListener("mouseenter", () => {
				element.hovered = true;
				this.positionCard(element);
				if (!element.selected) {
					element.style.boxShadow =
						"2px 6px 18px rgba(255,220,100,0.5)";
				}
			});
			element.addEventListener("mouseleave", () => {
				element.hovered = false;
				this.positionCard(element);
				if (!element.selected)
					element.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.5)";
			});
		}

		return element;
	}

	private onCardClick(element: CardElement): void {
		const cardKey = `${element.seat}-${element.index}`;
		if (this.selectedCards.has(cardKey)) {
			this.selectedCards.delete(cardKey);
			element.selected = false;
			element.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.5)";
			element.style.outline = "none";
		} else {
			this.selectedCards.add(cardKey);
			element.selected = true;
			element.style.boxShadow =
				"0 0 0 3px #f5c842, 0 4px 20px rgba(245,200,66,0.6)";
		}
		this.positionCard(element);
	}

	private updateTurnGlow(): void {
		const currentSeat = gs.room.game.currentIndex;
		for (const element of this.cardEls) {
			if (element.seat === currentSeat && !element.selected) {
				element.style.filter =
					"drop-shadow(0 0 5px rgba(100,140,255,0.7))";
			} else if (!element.selected) {
				element.style.filter = "none";
			}
		}
	}

	public renderHand(game: Game): void {
		for (const element of this.cardEls) element.remove();
		this.cardEls = [];
		this.selectedCards.clear();

		for (const [seat, player] of game.players.entries()) {
			for (const [index, card] of player.hand.cards.entries()) {
				const element = this.createCardEl(card, index, seat);
				this.tableEl.append(element);
				this.cardEls.push(element);
			}
		}

		for (const element of this.cardEls) this.positionCard(element);
		this.updateTurnGlow();
	}

	public getSelectedCards(): Card[] {
		return [...this.selectedCards]
			.sort((a, b) => {
				const [seatA, indexA] = a.split("-").map(Number);
				const [seatB, indexB] = b.split("-").map(Number);
				return seatA === seatB ? indexA - indexB : seatA - seatB;
			})
			.map((key) => {
				const [seat, index] = key.split("-").map(Number);
				return this.cardEls.find(
					(e) => e.seat === seat && e.index === index,
				)!.card;
			});
	}

	public clearSelection(): void {
		this.selectedCards.clear();
		for (const element of this.cardEls) {
			element.selected = false;
			element.style.boxShadow = "2px 3px 8px rgba(0,0,0,0.5)";
			element.style.outline = "none";
			this.positionCard(element);
		}
	}

	public dispose(): void {
		window.removeEventListener("resize", this.repositionAll);
		for (const element of this.cardEls) element.remove();
		this.container.innerHTML = "";
	}
}

let cardUI: CardUI | undefined;

export function initCardUI(
	containerId: string = "#game-area",
	callbacks?: { onPlay?: (cards: Card[]) => void; onPass?: () => void },
): void {
	if (!cardUI) cardUI = new CardUI(containerId, callbacks);
}

export function updateCardDisplay(): void {
	if (cardUI) cardUI.renderHand(gs.room.game);
}

export function getSelectedCardsFromUI(): Card[] {
	return cardUI ? cardUI.getSelectedCards() : [];
}

export function clearCardSelection(): void {
	if (cardUI) cardUI.clearSelection();
}

export function disposeCardUI(): void {
	if (cardUI) {
		cardUI.dispose();
		cardUI = undefined;
	}
}
