import type { Card } from "@shared/card";
import { getCardKey } from "./game-ui-state";
import { gs } from "./session";

type CardRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

type TableTarget = CardRect & {
	key: string;
	src: string;
	element: HTMLImageElement;
};

type CardMotionSnapshot = {
	handRectsByMotionKey: Map<string, CardRect>;
	handRectsByOwnerCardKey: Map<string, CardRect[]>;
	handRectsByOwner: Map<string, CardRect[]>;
	playSignature: string | undefined;
	playedPlayerId: string | undefined;
	playedCards: Card[];
	shouldAnimatePlay: boolean;
};

const CARD_MOVE_DURATION = 260;
const CARD_PLACE_DURATION = 340;
const CARD_MOVE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const CARD_PLACE_EASING = "cubic-bezier(0.18, 0.9, 0.2, 1)";
const MOTION_MIN_DELTA = 0.5;

let lastRenderedPlaySignature: string | undefined;
let activeTableMotionSignature: string | undefined;
let activeTableMotionCount = 0;
const hiddenTableTargets = new Set<HTMLImageElement>();

export function captureCardMotionSnapshot(): CardMotionSnapshot {
	const game = gs.room?.game;
	const playSignature = getCurrentPlaySignature();
	const playedCards = game?.lastPlay?.cards ?? [];
	const playedPlayer =
		game?.lastPlay && game.players[game.lastPlay.playerIndex]
			? game.players[game.lastPlay.playerIndex]
			: undefined;

	const snapshot: CardMotionSnapshot = {
		handRectsByMotionKey: new Map(),
		handRectsByOwnerCardKey: new Map(),
		handRectsByOwner: new Map(),
		playSignature,
		playedPlayerId: playedPlayer?.id,
		playedCards,
		shouldAnimatePlay:
			!!playSignature &&
			playSignature !== lastRenderedPlaySignature &&
			playedCards.length > 0,
	};

	for (const card of document.querySelectorAll<HTMLElement>(
		".hand-card[data-card-motion-key]",
	)) {
		const ownerId = card.dataset.cardOwnerId;
		if (!ownerId) continue;

		const rect = toCardRect(card.getBoundingClientRect());
		const motionKey = card.dataset.cardMotionKey;
		const cardKey = card.dataset.cardKey;

		if (motionKey) snapshot.handRectsByMotionKey.set(motionKey, rect);
		pushRect(snapshot.handRectsByOwner, ownerId, rect);
		if (cardKey)
			pushRect(
				snapshot.handRectsByOwnerCardKey,
				ownerCardKey(ownerId, cardKey),
				rect,
			);
	}

	return snapshot;
}

export function runCardMotion(snapshot: CardMotionSnapshot): void {
	syncActiveTableMotionTargets();

	if (shouldSkipMotion()) {
		lastRenderedPlaySignature = snapshot.playSignature;
		revealFinishedTableTargets(snapshot.playSignature);
		return;
	}

	animateHandRelocations(snapshot);

	if (snapshot.shouldAnimatePlay) {
		animatePlayedCardsToTable(snapshot);
	} else {
		lastRenderedPlaySignature = snapshot.playSignature;
		revealFinishedTableTargets(snapshot.playSignature);
	}
}

export function resetCardMotionHistory(): void {
	lastRenderedPlaySignature = undefined;
	activeTableMotionSignature = undefined;
	activeTableMotionCount = 0;
	revealAllTableTargets();
}

function animateHandRelocations(snapshot: CardMotionSnapshot): void {
	for (const card of document.querySelectorAll<HTMLElement>(
		".hand-card[data-card-motion-key]",
	)) {
		const motionKey = card.dataset.cardMotionKey;
		if (!motionKey) continue;

		const from = snapshot.handRectsByMotionKey.get(motionKey);
		if (!from) continue;

		const to = toCardRect(card.getBoundingClientRect());
		const deltaX = from.left - to.left;
		const deltaY = from.top - to.top;
		if (
			Math.abs(deltaX) < MOTION_MIN_DELTA &&
			Math.abs(deltaY) < MOTION_MIN_DELTA
		)
			continue;

		const finalTransform = getComputedStyle(card).transform;
		const baseTransform = finalTransform === "none" ? "" : finalTransform;
		card.classList.add("is-card-relocating");
		const animation = card.animate(
			[
				{
					transform: `translate(${deltaX}px, ${deltaY}px) ${baseTransform}`.trim(),
				},
				{ transform: baseTransform || "none" },
			],
			{
				duration: CARD_MOVE_DURATION,
				easing: CARD_MOVE_EASING,
			},
		);
		animation.addEventListener("finish", () => {
			card.classList.remove("is-card-relocating");
		});
		animation.addEventListener("cancel", () => {
			card.classList.remove("is-card-relocating");
		});
	}
}

function animatePlayedCardsToTable(snapshot: CardMotionSnapshot): void {
	const tableTargets = getTableTargets(snapshot.playedCards);
	if (
		!snapshot.playSignature ||
		!snapshot.playedPlayerId ||
		tableTargets.length === 0
	) {
		lastRenderedPlaySignature = snapshot.playSignature;
		return;
	}

	const sourceRects = getPlayedSourceRects(snapshot);
	if (sourceRects.length === 0) {
		lastRenderedPlaySignature = snapshot.playSignature;
		return;
	}

	activeTableMotionSignature = snapshot.playSignature;
	activeTableMotionCount += 1;
	const motionRun = activeTableMotionCount;
	hideTableTargets(tableTargets.map((target) => target.element));

	let pending = 0;
	for (const [index, target] of tableTargets.entries()) {
		const source = sourceRects[index] ?? sourceRects[sourceRects.length - 1];
		if (!source) continue;

		pending += 1;
		animateCardClone(source, target, () => {
			pending -= 1;
			if (pending > 0) return;
			if (activeTableMotionCount === motionRun) {
				activeTableMotionSignature = undefined;
				revealFinishedTableTargets(snapshot.playSignature);
			}
		});
	}

	if (pending === 0) {
		activeTableMotionSignature = undefined;
		revealFinishedTableTargets(snapshot.playSignature);
	}
	lastRenderedPlaySignature = snapshot.playSignature;
}

function animateCardClone(
	source: CardRect,
	target: TableTarget,
	onDone: () => void,
): void {
	const clone = document.createElement("img");
	clone.className = "card-flight-clone";
	clone.src = target.src;
	clone.alt = "";
	clone.draggable = false;
	Object.assign(clone.style, {
		left: `${source.left}px`,
		top: `${source.top}px`,
		width: `${source.width}px`,
		height: `${source.height}px`,
	});
	document.body.append(clone);

	const scaleX = target.width / Math.max(source.width, 1);
	const scaleY = target.height / Math.max(source.height, 1);
	const animation = clone.animate(
		[
			{
				opacity: 0.92,
				transform: "translate3d(0, 0, 0) scale(1)",
			},
			{
				opacity: 1,
				transform: `translate3d(${target.left - source.left}px, ${target.top - source.top}px, 0) scale(${scaleX}, ${scaleY})`,
			},
		],
		{
			duration: CARD_PLACE_DURATION,
			easing: CARD_PLACE_EASING,
		},
	);

	const cleanup = () => {
		clone.remove();
		onDone();
	};
	animation.addEventListener("finish", cleanup, { once: true });
	animation.addEventListener("cancel", cleanup, { once: true });
}

function getPlayedSourceRects(snapshot: CardMotionSnapshot): CardRect[] {
	if (!snapshot.playedPlayerId) return [];

	const byCardKey = new Map<string, CardRect[]>();
	for (const [key, rects] of snapshot.handRectsByOwnerCardKey)
		byCardKey.set(key, [...rects]);

	const fallbackRects = getRemovedFallbackRects(
		snapshot.handRectsByOwner.get(snapshot.playedPlayerId) ?? [],
		snapshot.playedCards.length,
	);

	return snapshot.playedCards
		.map((card, index) => {
			const rects = byCardKey.get(
				ownerCardKey(snapshot.playedPlayerId!, getCardKey(card)),
			);
			return rects?.shift() ?? fallbackRects[index];
		})
		.filter((rect): rect is CardRect => !!rect);
}

function getRemovedFallbackRects(rects: CardRect[], count: number): CardRect[] {
	if (count <= 0) return [];
	if (rects.length <= count) return [...rects];
	return rects.slice(rects.length - count);
}

function getTableTargets(cards: Card[]): TableTarget[] {
	const targets = [
		...document.querySelectorAll<HTMLImageElement>(
			".table-card-img[data-card-key]",
		),
	];
	const targetsByKey = new Map<string, TableTarget[]>();

	for (const element of targets) {
		const key = element.dataset.cardKey;
		if (!key) continue;
		const target = {
			...toCardRect(element.getBoundingClientRect()),
			key,
			src: element.currentSrc || element.src,
			element,
		};
		pushTarget(targetsByKey, key, target);
	}

	return cards
		.map((card, index) => {
			const byKeyTarget = targetsByKey.get(getCardKey(card))?.shift();
			if (byKeyTarget) return byKeyTarget;

			const element = targets[index];
			if (!element) return undefined;
			return {
				...toCardRect(element.getBoundingClientRect()),
				key: element.dataset.cardKey ?? getCardKey(card),
				src: element.currentSrc || element.src,
				element,
			};
		})
		.filter((target): target is TableTarget => !!target);
}

function getCurrentPlaySignature(): string | undefined {
	const play = gs.room?.game?.lastPlay;
	if (!play || play.cards.length === 0) return undefined;
	return `${play.playerIndex}:${play.cards.map((card) => getCardKey(card)).join("|")}`;
}

function hideTableTargets(targets: HTMLImageElement[]): void {
	for (const target of targets) {
		target.classList.add("is-card-motion-target");
		hiddenTableTargets.add(target);
	}
}

function syncActiveTableMotionTargets(): void {
	if (!activeTableMotionSignature) return;
	if (getCurrentPlaySignature() !== activeTableMotionSignature) return;

	hideTableTargets([
		...document.querySelectorAll<HTMLImageElement>(".table-card-img"),
	]);
}

function revealFinishedTableTargets(playSignature: string | undefined): void {
	if (activeTableMotionSignature && activeTableMotionSignature === playSignature)
		return;

	revealAllTableTargets();
}

function revealAllTableTargets(): void {
	for (const target of hiddenTableTargets)
		target.classList.remove("is-card-motion-target");
	hiddenTableTargets.clear();
}

function shouldSkipMotion(): boolean {
	return (
		globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
		false
	);
}

function ownerCardKey(ownerId: string, cardKey: string): string {
	return `${ownerId}::${cardKey}`;
}

function pushRect(
	map: Map<string, CardRect[]>,
	key: string,
	rect: CardRect,
): void {
	const existing = map.get(key);
	if (existing) {
		existing.push(rect);
	} else {
		map.set(key, [rect]);
	}
}

function pushTarget(
	map: Map<string, TableTarget[]>,
	key: string,
	target: TableTarget,
): void {
	const existing = map.get(key);
	if (existing) {
		existing.push(target);
	} else {
		map.set(key, [target]);
	}
}

function toCardRect(rect: DOMRect): CardRect {
	return {
		left: rect.left,
		top: rect.top,
		width: rect.width,
		height: rect.height,
	};
}
