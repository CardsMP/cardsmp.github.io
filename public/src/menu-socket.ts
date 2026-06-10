import { Player } from "@shared/player";
import { showError } from "./menu-ui";
import { sn } from "./session";

export function initMenuSocket(): void {
	sn.socket.on("created-player", (id: string, auth: string) => {
		sn.player = new Player(id, "");
		sn.auth = auth;
		sn.name = "";
		sessionStorage.removeItem("name");
		sessionStorage.setItem("id", id);
		sessionStorage.setItem("auth", auth);
		const nameInput = document.querySelector(
			"#player-name-input",
		) as HTMLInputElement | null;
		const modalInput = document.querySelector(
			"#modal-name-input",
		) as HTMLInputElement | null;
		if (nameInput) nameInput.value = "";
		if (modalInput) modalInput.value = "";
	});

	sn.socket.on("sent-player", (name: string) => {
		sn.player?.name
			? (sn.player.name = name)
			: (sn.player = new Player(sn.player?.id || "", name));
		sn.name = name;
		sessionStorage.setItem("name", name);
		const nameInput = document.querySelector(
			"#player-name-input",
		) as HTMLInputElement | null;
		const modalInput = document.querySelector(
			"#modal-name-input",
		) as HTMLInputElement | null;
		if (nameInput) nameInput.value = name;
		if (modalInput) modalInput.value = name;
	});

	sn.socket.on("error", (error: string) => {
		showError("menu-error", error);
	});
}
