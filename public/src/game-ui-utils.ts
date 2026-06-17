import { JOKER_RANK, TWO_RANK, type Card } from "@shared/card";
import { getAssetPath } from "./app-paths";
import { selectedCardKeys, setPreMoveEnabled } from "./game-ui-state";

const preloadedImages = new Set<string>();

export function clearGameArea(): void {
	selectedCardKeys.clear();
	setPreMoveEnabled(false);

	for (const el of document.querySelectorAll(".player-seat")) el.remove();

	for (const el of document.querySelectorAll(".player-nameplate"))
		el.remove();

	const handArea = document.querySelector("#card-hand-area");
	if (handArea) handArea.innerHTML = "";

	const actionArea = document.querySelector("#action-buttons");
	if (actionArea) actionArea.innerHTML = "";

	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (banner) banner.style.display = "none";

	const msg = document.querySelector("#table-container") as HTMLElement;
	if (msg) msg.innerHTML = "";
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

export function getCardImagePath(card: Card): string {
	if (card.suit === "Red Joker") return getAssetPath("cards/Joker1.png");
	if (card.suit === "Black Joker") return getAssetPath("cards/Joker2.png");

	const suitMap: Record<string, string> = {
		h: "hearts",
		d: "diamonds",
		c: "clubs",
		s: "spades",
	};
	const rankMap: Record<number, string> = {
		14: "ace",
		1: "ace",
		11: "jack",
		12: "queen",
		13: "king",
		[TWO_RANK]: "02",
		2: "02",
	};
	const rank = rankMap[card.rank] || String(card.rank).padStart(2, "0");
	return getAssetPath(`cards/${suitMap[card.suit]}_${rank}.png`);
}

export function preloadCardImages(cards: Card[]): void {
	for (const card of cards) {
		const href = getCardImagePath(card);
		if (preloadedImages.has(href)) continue;
		preloadedImages.add(href);

		const link = document.createElement("link");
		link.rel = "preload";
		link.as = "image";
		link.fetchPriority = "high";
		link.href = href;
		document.head.prepend(link);
	}
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
