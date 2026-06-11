import { JOKER_RANK, TWO_RANK, type Card } from "@shared/card";
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

export function getCardImagePath(card: Card): string {
	if (card.suit === "Red Joker") return "/cards/Joker1.png";
	if (card.suit === "Black Joker") return "/cards/Joker2.png";

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
	return `/cards/${suitMap[card.suit]}_${rank}.png`;
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
