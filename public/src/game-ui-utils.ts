import type { Card } from "@shared/card";
import { selectedCardKeys } from "./game-ui-state";

export function clearGameArea(): void {
	selectedCardKeys.clear();

	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();

	const handArea = document.querySelector("#card-hand-area");
	if (handArea) handArea.innerHTML = "";

	const actionArea = document.querySelector("#action-buttons");
	if (actionArea) actionArea.innerHTML = "";

	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (banner) banner.style.display = "none";

	const msg = document.querySelector("#table-center-message") as HTMLElement;
	if (msg) {
		msg.classList.add("is-empty");
		msg.innerHTML = "";
		msg.style.display = "flex";
	}
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function formatPlayType(type: string): string {
	const typeNames: Record<string, string> = {
		solo: "Single",
		pair: "Pair",
		triple: "Triple",
		triple_with_single: "Triple + Single",
		triple_with_pair: "Triple + Pair",
		straight: "Straight",
		pair_straight: "Pair Straight",
		triple_straight: "Airplane",
		bomb: "Bomb",
		rocket: "Rocket",
	};

	return typeNames[type] || type;
}

export function getCardDisplay(card: Card): {
	rank: string;
	suit: string;
	isRed: boolean;
	label: string;
} {
	if (card.type === "Joker") {
		const isRed = card.color === "RED";
		return {
			rank: isRed ? "🃟" : "🃏",
			suit: isRed ? "Red" : "Blk",
			isRed,
			label: isRed ? "Red Joker" : "Black Joker",
		};
	}

	const rankMap: Record<number, string> = {
		1: "A",
		11: "J",
		12: "Q",
		13: "K",
	};
	const suitMap: Record<string, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };
	const isRed = card.suit === "h" || card.suit === "d";

	const rank = rankMap[card.rank] ?? String(card.rank);
	const suit = suitMap[card.suit] ?? "";

	return { rank, suit, isRed, label: `${rank}${suit}` };
}

export function getCardImagePath(card: Card): string {
	if (card.type === "Joker") {
		return card.color === "RED" ? "/cards/Joker1.png" : "/cards/Joker2.png";
	}

	if (card.type === "Playing") {
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
		const rank = rankMap[card.rank] || String(card.rank).padStart(2, "0");
		return `/cards/${suitMap[card.suit]}_${rank}.png`;
	}

	return "/cards/back01.png";
}

export function makeBtn(
	label: string,
	className: string,
	onClick: () => void,
): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.className = `btn-white-transparent ${className}`;
	btn.textContent = label;
	btn.addEventListener("click", onClick);
	return btn;
}
