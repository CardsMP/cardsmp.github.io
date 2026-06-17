import { renderCardHand } from "./game-ui-render";
import { passTurn, playSelectedCards } from "./game-ui-actions";
import { sendChatMessage } from "./game-ui-chat";

function handlePlayCards(): void {
	if (playSelectedCards()) renderCardHand();
}

function handlePass(): void {
	if (passTurn()) renderCardHand();
}

export function initGameControls(): void {
	const chatInput = document.querySelector("#chat-input") as HTMLInputElement;
	chatInput?.addEventListener("keydown", (e: Event) => {
		const ke = e as KeyboardEvent;
		e.stopPropagation();
		if (ke.key === "Enter") {
			ke.preventDefault();
			sendChatMessage(chatInput);
		}
	});

	document.addEventListener("keydown", (event: Event) => {
		const ke = event as KeyboardEvent;
		const target = ke.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

		if (ke.key === " " || ke.key === "Enter") {
			ke.preventDefault();
			handlePlayCards();
		}
		if (ke.key === "p" || ke.key === "P") {
			ke.preventDefault();
			handlePass();
		}
	});
}
