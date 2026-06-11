import { initGameSocket } from "./game-socket";
import { initGameControls } from "./game-ui-controls";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { checkURLForRoom } from "./url";
import { updateUIGame } from "./game-ui-render";

let resizeRaf = 0;
let layoutObserver: ResizeObserver | null = null;

function scheduleLayoutRefresh(): void {
	if (resizeRaf) return;

	resizeRaf = window.requestAnimationFrame(() => {
		resizeRaf = 0;
		updateUIGame();
	});
}

function initLayoutResizeObserver(): void {
	if (layoutObserver) return;

	const tableArea = document.querySelector("#game-area-table");
	const handArea = document.querySelector("#card-hand-area");
	if (!tableArea || !handArea) return;

	if ("ResizeObserver" in window) {
		layoutObserver = new ResizeObserver(() => {
			scheduleLayoutRefresh();
		});

		layoutObserver.observe(tableArea);
		layoutObserver.observe(handArea);
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
		initLayoutResizeObserver();
		checkURLForRoom();
	})();
});
