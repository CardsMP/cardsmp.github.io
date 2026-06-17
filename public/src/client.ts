import { initGameSocket } from "./game-socket";
import { initChatControls } from "./game-ui-chat";
import {
	initLayoutResizeObserver,
	initSidebarResizer,
} from "./game-ui-sidebar";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { checkURLForRoom } from "./url";

document.addEventListener("DOMContentLoaded", () => {
	(function () {
		initSession();
		initMenuSocket();
		initMenuControls();
		initGameSocket();
		initChatControls();
		initSidebarResizer();
		initLayoutResizeObserver();
		checkURLForRoom();
	})();
});
