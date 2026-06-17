import { cardToString, type Card } from "@shared/card";
import { getAssetPath } from "./app-paths";
import { getCardKey, selectedCardKeys } from "./game-ui-state";
import { getCardImagePath, preloadCardImages } from "./game-ui-utils";
import { gs } from "./session";

const OPPONENT_CARD_BACK_PATH = getAssetPath("cards/back.png");

export function applyCardRowLayout(
	container: HTMLElement,
	totalCards: number,
	overlapVar?: string,
): void {
	const cardWidth = getCardLayoutWidth(container);
	const preferredGap = getCardLayoutGap(container);
	const availableWidth =
		container.clientWidth || container.getBoundingClientRect().width;
	const gapCount = Math.max(0, totalCards - 1);
	const cardWidthTotal = totalCards * cardWidth;
	const preferredWidth = cardWidthTotal + gapCount * preferredGap;

	if (totalCards <= 0 || availableWidth <= 0) {
		container.dataset.layoutMode = "gap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, "0px");
		} else {
			applyInlineCardOverlap(container, 0);
		}
		container.style.gap = `${preferredGap}px`;
		container.style.justifyContent = "center";
		return;
	}

	if (gapCount > 0 && cardWidthTotal > availableWidth) {
		const overlap =
			Math.min(
				cardWidth - 1,
				(cardWidthTotal - availableWidth) / gapCount,
			) || 0;
		container.dataset.layoutMode = "overlap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, `${overlap}px`);
		} else {
			applyInlineCardOverlap(container, overlap);
		}
		container.style.gap = "0px";
	} else {
		const gap =
			gapCount > 0
				? Math.min(
						preferredGap,
						(availableWidth - cardWidthTotal) / gapCount,
					)
				: preferredGap;

		container.dataset.layoutMode =
			gapCount > 0 && preferredWidth > availableWidth ? "fit-gap" : "gap";
		if (overlapVar) {
			container.style.setProperty(overlapVar, "0px");
		} else {
			applyInlineCardOverlap(container, 0);
		}
		container.style.gap = `${Math.max(0, gap)}px`;
	}

	container.style.justifyContent = "center";
}

function getCardLayoutWidth(container: HTMLElement): number {
	for (const child of [...container.children]) {
		if (!(child instanceof HTMLElement)) continue;

		const measuredWidth = child.getBoundingClientRect().width;
		if (Number.isFinite(measuredWidth) && measuredWidth > 0)
			return measuredWidth;

		const computedWidth = Number.parseFloat(getComputedStyle(child).width);
		if (Number.isFinite(computedWidth) && computedWidth > 0)
			return computedWidth;
	}

	const parsedCardWidth = Number.parseFloat(
		getComputedStyle(container).getPropertyValue("--card-width"),
	);
	return Math.max(
		1,
		Number.isFinite(parsedCardWidth) ? parsedCardWidth : 102,
	);
}

function getCardLayoutGap(container: HTMLElement): number {
	const styles = getComputedStyle(container);
	const computedGap = Number.parseFloat(styles.columnGap || styles.gap);
	if (Number.isFinite(computedGap)) return Math.max(0, computedGap);

	const parsedGap = Number.parseFloat(styles.getPropertyValue("--card-gap"));
	return Math.max(0, Number.isFinite(parsedGap) ? parsedGap : 8);
}

function applyInlineCardOverlap(container: HTMLElement, overlap: number): void {
	for (const [index, child] of [...container.children].entries()) {
		if (!(child instanceof HTMLElement)) continue;
		child.style.marginLeft =
			index > 0 && overlap > 0 ? `${overlap * -1}px` : "0px";
	}
}

export function refreshCardLayouts(): void {
	const handArea = document.querySelector(
		"#card-hand-area",
	) as HTMLElement | null;
	if (handArea) applyCardRowLayout(handArea, handArea.childElementCount);

	for (const opponentHand of document.querySelectorAll<HTMLElement>(
		".opponent-hand",
	)) {
		applyCardRowLayout(opponentHand, opponentHand.childElementCount);
	}

	for (const tableCards of document.querySelectorAll<HTMLElement>(
		".table-played-cards",
	)) {
		applyCardRowLayout(
			tableCards,
			tableCards.childElementCount,
			"--table-overlap",
		);
	}
}

export function getOwnHandArea(): HTMLElement {
	const existing = document.querySelector("#card-hand-area");
	if (existing instanceof HTMLElement) return existing;

	const hand = document.createElement("div");
	hand.id = "card-hand-area";
	return hand;
}

export function createOpponentHand(cardCount: number): HTMLElement {
	const hand = document.createElement("div");
	hand.className = "opponent-hand";
	hand.setAttribute("aria-label", `${cardCount} face-down cards`);

	for (let index = 0; index < cardCount; index++) {
		const card = document.createElement("div");
		card.className = "hand-card";

		const img = document.createElement("img");
		img.className = "hand-card-face";
		img.src = OPPONENT_CARD_BACK_PATH;
		img.alt = "";
		img.draggable = false;

		card.append(img);
		hand.append(card);
	}

	return hand;
}

export function preloadVisibleCardImages(): void {
	if (!gs.room?.game || gs.player.index === undefined) return;

	const myPlayer = gs.room.game.players[gs.player.index];
	const cards = myPlayer ? [...myPlayer.hand.cards] : [];
	if (gs.room.game.lastPlay?.cards?.length) {
		cards.push(...gs.room.game.lastPlay.cards);
	}

	preloadCardImages(cards);
}

export function renderCardHand(onSelectionChanged?: () => void): void {
	const handArea = document.querySelector("#card-hand-area") as HTMLElement;
	if (!handArea) return;
	handArea.innerHTML = "";

	const game = gs.room?.game;
	if (!game?.players || gs.player.index === undefined) return;

	const myPlayer = game.players[gs.player.index];
	if (!myPlayer) return;

	const currentKeys = new Set(
		myPlayer.hand.cards.map((card) => getCardKey(card)),
	);
	for (const key of [...selectedCardKeys]) {
		if (!currentKeys.has(key)) selectedCardKeys.delete(key);
	}

	for (const card of myPlayer.hand.cards) {
		const el = document.createElement("div");
		const cardKey = getCardKey(card);
		el.className = "hand-card";
		el.setAttribute("aria-label", cardToString(card));

		if (selectedCardKeys.has(cardKey)) el.classList.add("selected");

		const img = document.createElement("img");
		img.className = "hand-card-face";
		img.src = getCardImagePath(card);
		img.alt = cardToString(card);
		img.draggable = false;
		el.append(img);

		el.addEventListener("click", () => {
			if (selectedCardKeys.has(cardKey)) {
				selectedCardKeys.delete(cardKey);
				el.classList.remove("selected");
			} else {
				selectedCardKeys.add(cardKey);
				el.classList.add("selected");
			}
			onSelectionChanged?.();
		});

		el.style.zIndex = "1";
		handArea.append(el);
	}

	applyCardRowLayout(handArea, handArea.childElementCount);
}

export function createTableCardImage(card: Card): HTMLImageElement {
	const img = document.createElement("img");
	img.className = "table-card-img";
	img.src = getCardImagePath(card);
	img.alt = cardToString(card);
	img.draggable = false;
	return img;
}
