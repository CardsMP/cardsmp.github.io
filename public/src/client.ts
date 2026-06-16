import { initGameSocket } from "./game-socket";
import { initGameControls } from "./game-ui-controls";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { checkURLForRoom } from "./url";
import { refreshCardLayouts } from "./game-ui-render";

const SIDEBAR_STORAGE_KEY = "cardsmp-sidebar-width";
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 520;
const GAME_AREA_MIN_WIDTH = 520;

let resizeRaf = 0;
let layoutObserver: ResizeObserver | null = null;

function scheduleLayoutRefresh(): void {
	if (resizeRaf) return;

	resizeRaf = window.requestAnimationFrame(() => {
		resizeRaf = 0;
		refreshCardLayouts();
	});
}

function initSidebarResizer(): void {
	const game = document.querySelector("#game") as HTMLElement | null;
	const sidebar = document.querySelector(
		"#game-sidebar",
	) as HTMLElement | null;
	const resizer = document.querySelector(
		"#sidebar-resizer",
	) as HTMLElement | null;
	if (!game || !sidebar || !resizer) return;

	const applySidebarWidth = (width: number): number => {
		const clampedWidth = clampSidebarWidth(width);
		game.style.setProperty("--sidebar-width", `${clampedWidth}px`);
		updateSidebarResizerAria(resizer, clampedWidth);
		scheduleLayoutRefresh();
		return clampedWidth;
	};

	const getCurrentSidebarWidth = (): number => {
		const renderedWidth = sidebar.getBoundingClientRect().width;
		if (Number.isFinite(renderedWidth) && renderedWidth > 0)
			return renderedWidth;

		const cssWidth = Number.parseFloat(
			getComputedStyle(game).getPropertyValue("--sidebar-width"),
		);
		if (Number.isFinite(cssWidth)) return cssWidth;

		return SIDEBAR_DEFAULT_WIDTH;
	};

	applySidebarWidth(readStoredSidebarWidth() ?? SIDEBAR_DEFAULT_WIDTH);

	resizer.addEventListener("pointerdown", (event: PointerEvent) => {
		if (event.button !== 0) return;

		event.preventDefault();
		resizer.classList.add("is-active");
		document.body.classList.add("is-resizing-sidebar");
		resizer.setPointerCapture(event.pointerId);

		const handlePointerMove = (moveEvent: PointerEvent): void => {
			const gameLeft = game.getBoundingClientRect().left;
			applySidebarWidth(moveEvent.clientX - gameLeft);
		};

		const finishResize = (finishEvent: PointerEvent): void => {
			resizer.classList.remove("is-active");
			document.body.classList.remove("is-resizing-sidebar");
			resizer.removeEventListener("pointermove", handlePointerMove);
			resizer.removeEventListener("pointerup", finishResize);
			resizer.removeEventListener("pointercancel", finishResize);
			if (resizer.hasPointerCapture(finishEvent.pointerId))
				resizer.releasePointerCapture(finishEvent.pointerId);
			writeStoredSidebarWidth(getCurrentSidebarWidth());
		};

		resizer.addEventListener("pointermove", handlePointerMove);
		resizer.addEventListener("pointerup", finishResize);
		resizer.addEventListener("pointercancel", finishResize);
	});

	resizer.addEventListener("keydown", (event: KeyboardEvent) => {
		const step = event.shiftKey ? 40 : 16;
		const currentWidth = getCurrentSidebarWidth();
		let nextWidth: number | undefined;

		if (event.key === "ArrowLeft") nextWidth = currentWidth - step;
		else if (event.key === "ArrowRight") nextWidth = currentWidth + step;
		else if (event.key === "Home") nextWidth = SIDEBAR_MIN_WIDTH;
		else if (event.key === "End") nextWidth = getSidebarMaxWidth();
		else return;

		event.preventDefault();
		writeStoredSidebarWidth(applySidebarWidth(nextWidth));
	});

	window.addEventListener("resize", () => {
		applySidebarWidth(getCurrentSidebarWidth());
	});
}

function clampSidebarWidth(width: number): number {
	return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getSidebarMaxWidth());
}

function getSidebarMaxWidth(): number {
	return Math.min(
		SIDEBAR_MAX_WIDTH,
		Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - GAME_AREA_MIN_WIDTH),
	);
}

function updateSidebarResizerAria(resizer: HTMLElement, width: number): void {
	resizer.setAttribute("aria-valuemin", String(SIDEBAR_MIN_WIDTH));
	resizer.setAttribute("aria-valuemax", String(getSidebarMaxWidth()));
	resizer.setAttribute("aria-valuenow", String(Math.round(width)));
}

function readStoredSidebarWidth(): number | undefined {
	try {
		const value = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
		if (!value) return undefined;

		const width = Number.parseFloat(value);
		return Number.isFinite(width) ? width : undefined;
	} catch {
		return undefined;
	}
}

function writeStoredSidebarWidth(width: number): void {
	try {
		window.localStorage.setItem(
			SIDEBAR_STORAGE_KEY,
			String(Math.round(width)),
		);
	} catch {}
}

function initLayoutResizeObserver(): void {
	if (layoutObserver) return;

	const tableArea = document.querySelector("#field-area");
	const gameArea = document.querySelector("#game-area");
	if (!tableArea) return;

	if ("ResizeObserver" in window) {
		layoutObserver = new ResizeObserver(() => {
			scheduleLayoutRefresh();
		});

		layoutObserver.observe(tableArea);
		if (gameArea) layoutObserver.observe(gameArea);
	}

	window.addEventListener("resize", scheduleLayoutRefresh);
}

document.addEventListener("DOMContentLoaded", () => {
	(function () {
		initSession();
		initMenuSocket();
		initMenuControls();
		initGameSocket();
		initGameControls();
		initSidebarResizer();
		initLayoutResizeObserver();
		checkURLForRoom();
	})();
});
