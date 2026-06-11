import { sn } from "./session";

// Store the pending action
let pendingAction: (() => void) | undefined;

export function initMenuControls(): void {
	// Join game button
	const joinGameButton = document.querySelector(
		"#join-game-btn",
	) as HTMLButtonElement;
	const roomCodeInput = document.querySelector(
		"#room-code-input",
	) as HTMLInputElement;

	// Create game button
	const createGameButton = document.querySelector(
		"#create-game-btn",
	) as HTMLButtonElement;

	// Handle join game
	joinGameButton.addEventListener("click", () => {
		const roomCode = roomCodeInput.value.trim() || "";

		if (roomCode.length === 4) {
			// Join room
			if (
				checkAndPromptForName(() => {
					sn.socket.emit("join-room", roomCode);
				})
			)
				sn.socket.emit("join-room", roomCode);
		} else {
			showError("menu-error", "Room code must be 4 characters");
		}
	});

	// Handle create game
	createGameButton.addEventListener("click", () => {
		if (
			checkAndPromptForName(() => {
				sn.socket.emit("create-room");
			})
		)
			sn.socket.emit("create-room");
	});

	roomCodeInput.addEventListener("keypress", (event: Event) => {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === "Enter") joinGameButton.click();
	});

	setupNameInput("player-name-input");

	setupNameModal();
}

// Export this function so it can be used in other files
export function checkAndPromptForName(action: () => void): boolean {
	const nameInput = document.querySelector(
		"#player-name-input",
	) as HTMLInputElement;
	const storedName = globalThis.sessionStorage?.getItem("name") || "";
	const currentName = nameInput.value.trim() || storedName;

	if (!currentName) {
		pendingAction = action;
		showNameModal();
		return false;
	}

	return true;
}

function setupNameModal(): void {
	const modal = document.querySelector("#name-modal") as HTMLDivElement;
	const closeButton = document.querySelector(
		"#close-modal",
	) as HTMLButtonElement;
	const submitButton = document.querySelector(
		"#submit-name-btn",
	) as HTMLButtonElement;
	const modalInput = document.querySelector(
		"#modal-name-input",
	) as HTMLInputElement;

	closeButton.addEventListener("click", () => {
		pendingAction = undefined;
		hideNameModal();
	});

	modal.addEventListener("click", (event) => {
		if (event.target === modal) {
			pendingAction = undefined;
			hideNameModal();
		}
	});

	submitButton.addEventListener("click", () => {
		const name = modalInput.value.trim();
		if (name) {
			const mainInput = document.querySelector(
				"#player-name-input",
			) as HTMLInputElement;

			mainInput.value = name;
			sessionStorage.setItem("name", name);
			sn.name = name;
			if (sn.player) sn.player.name = name;

			sn.socket.emit("set-name", name);
			hideNameModal();

			// Execute the pending action
			if (pendingAction) {
				pendingAction();
				pendingAction = undefined;
			}
		}
	});

	modalInput.addEventListener("keypress", (event: Event) => {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === "Enter") submitButton.click();
	});
}

function showNameModal(): void {
	const modal = document.querySelector("#name-modal");
	const modalInput = document.querySelector(
		"#modal-name-input",
	) as HTMLInputElement;
	if (modal) {
		modal.classList.remove("hidden");
		modalInput.focus();
	}
}

function hideNameModal(): void {
	const modal = document.querySelector("#name-modal");
	const modalInput = document.querySelector(
		"#modal-name-input",
	) as HTMLInputElement;
	const errorElement = document.querySelector("#modal-error");
	if (modal) {
		modal.classList.add("hidden");
		modalInput.value = "";
		if (errorElement) errorElement.textContent = "";
	}
}

function handleNameSubmit(event: Event): void {
	const target = event.target as HTMLInputElement;
	const name = target.value.trim();
	if (name) {
		sessionStorage.setItem("name", name);
		sn.name = name;
		if (sn.player) sn.player.name = name;
		sn.socket.emit("set-name", name);
	}
}

function setupNameInput(elementId: string) {
	const input = document.querySelector(`#${elementId}`);
	const storedName = globalThis.sessionStorage?.getItem("name") || "";
	if (input instanceof HTMLInputElement && storedName && !input.value) {
		input.value = storedName;
	}

	input?.addEventListener("keypress", (event: Event) => {
		const keyEvent = event as KeyboardEvent;
		if (keyEvent.key === "Enter") handleNameSubmit(event);
	});

	input?.addEventListener("blur", handleNameSubmit);
}

export function showError(elementId: string, message: string): void {
	const errorElement = document.querySelector(`#${elementId}`);
	if (errorElement) {
		errorElement.textContent = message;
		setTimeout(() => {
			errorElement.textContent = "";
		}, 5000);
	}
}
