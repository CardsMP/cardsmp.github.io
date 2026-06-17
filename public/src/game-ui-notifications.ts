import { GamePhase } from "@shared/game";
import { applyCardRowLayout, createTableCardImage } from "./game-ui-cards";
import { getLocalGamePlayerIndex } from "./game-ui-local-player";
import { escapeHtml, formatPlayType } from "./game-ui-utils";
import { gs } from "./session";

export function renderTurnBanner(): void {
	const banner = document.querySelector("#turn-banner") as HTMLElement;
	if (!banner) return;

	if (!gs.room || !gs.player) {
		banner.style.display = "none";
		return;
	}

	const game = gs.room.game;
	if (!game?.current) {
		banner.style.display = "none";
		return;
	}

	const currentName = game.players[game.currentIndex]?.name || "Unknown";
	const isYou = game.currentIndex === getLocalGamePlayerIndex();

	if (game.phase === "bidding") {
		banner.textContent = isYou
			? "Your turn to bid."
			: `${currentName}'s turn to bid.`;
		banner.style.display = "flex";
	} else if (game.phase === "playing") {
		banner.textContent = isYou
			? "Your turn to play."
			: `${currentName}'s turn to play.`;
		banner.style.display = "flex";
	} else {
		banner.textContent = "";
		banner.style.display = "none";
	}
}

export function renderTableMessage(): void {
	const msg = document.querySelector("#table-container") as HTMLElement;
	if (!msg) return;

	if (!gs.room || !gs.player) {
		msg.textContent = "";
		msg.className = "";
		return;
	}

	const game = gs.room.game;
	msg.style.display = "flex";

	if (!game) {
		msg.classList.add("is-empty");
		msg.replaceChildren();
		return;
	}

	if (game.phase === "bidding") {
		msg.classList.remove("is-empty");
		msg.textContent = "Betting round, winner takes the bottom.";
	} else if (
		(game.phase === GamePhase.PLAYING ||
			game.phase === GamePhase.FINISHED) &&
		game.lastPlay
	) {
		msg.classList.remove("is-empty");
		const playerName =
			game.players[game.lastPlay.playerIndex]?.name || "Unknown";
		const type = formatPlayType(game.lastPlay.type);
		msg.innerHTML = "";

		const title = document.createElement("div");
		title.className = "table-play-title";
		title.innerHTML = `<strong>${escapeHtml(playerName)}</strong> played`;

		const cards = document.createElement("div");
		cards.className = "table-played-cards";
		for (const [index, card] of game.lastPlay.cards.entries())
			cards.append(createTableCardImage(card, index));

		const footer = document.createElement("div");
		footer.className = "table-play-type";
		footer.textContent = type;

		msg.append(title, cards, footer);
		applyCardRowLayout(
			cards,
			game.lastPlay.cards.length,
			"--table-overlap",
		);
	} else if (game.phase === GamePhase.FINISHED) {
		msg.classList.remove("is-empty");
		msg.textContent = "Waiting to start next round...";
	} else {
		msg.classList.add("is-empty");
		msg.replaceChildren();
	}
}
