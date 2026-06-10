import { checkAndPromptForName } from "./menu-ui";
import { sn } from "./session";

export function checkURLForRoom(): void {
	const roomCode = getRoomCodeFromPath();

	if (
		roomCode &&
		roomCode.length === 4 &&
		checkAndPromptForName(() => {
			clearRoomURL();
			sn.socket.emit("join-room", roomCode);
		})
	) {
		clearRoomURL();
		sn.socket.emit("join-room", roomCode);
	}
}

export function updateURL(roomCode: string): void {
	globalThis.history.replaceState({}, "", `/games/${roomCode}`);
}

export function clearRoomURL(): void {
	globalThis.history.replaceState({}, "", "/");
}

function getRoomCodeFromPath(): string | undefined {
	// Extract room code from path like /games/ABCD
	const pathParts = globalThis.location.pathname.split("/");
	return pathParts[2];
}
