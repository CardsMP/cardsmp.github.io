import type { Card } from "./card";
import { Hand } from "./game";

export enum PlayerStatus {
   NOT_READY = "not_ready",
   DISCONNECTED = "disconnected",
}

export interface SerializedPlayer {
   id: string;
   name: string;
   hand: Card[];
   status: PlayerStatus;
   gameIndex?: number;
   score: number;
}

export class Player {
   id: string;
   name: string;
   hand: Hand;
   status: PlayerStatus;
   index: number | undefined;
   score: number;

   constructor(id: string, name?: string) {
      this.id = id;
      this.name = name ?? id;
      this.hand = new Hand([]);
      this.status = PlayerStatus.NOT_READY;
      this.index = undefined;
      this.score = 0;
   }

   serialize(): SerializedPlayer {
      return {
         id: this.id,
         name: this.name,
         hand: this.hand.cards,
         status: this.status,
         gameIndex: this.index,
         score: this.score,
      };
   }

   static deserialize(data: SerializedPlayer): Player {
      const player = new Player(data.id, data.name);
      player.hand = new Hand(data.hand);
      player.status = data.status;
      player.index = data.gameIndex;
      player.score = data.score ?? 0;
      return player;
   }
}
