import type { Player } from "@shared/player";
import { gs } from "./session";

export function getLocalGamePlayer(): Player | undefined {
	const game = gs.room?.game;
	const playerId = gs.player?.id;
	if (!game || !playerId) return undefined;

	return game.players.find((player) => player.id === playerId);
}

export function getLocalGamePlayerIndex(): number | undefined {
	const game = gs.room?.game;
	const playerId = gs.player?.id;
	if (!game || !playerId) return undefined;

	const index = game.players.findIndex((player) => player.id === playerId);
	return index === -1 ? undefined : index;
}
