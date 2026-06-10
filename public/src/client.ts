import { initGameSocket } from "./game-socket";
import { initGameControls } from "./game-ui";
import { initMenuSocket } from "./menu-socket";
import { initMenuControls } from "./menu-ui";
import { initSession } from "./session";
import { checkURLForRoom } from "./url";
import "../styles/base.css";
import "../styles/menu.css";
import "../styles/game.css";
import "../styles/game-sides.css";

document.addEventListener("DOMContentLoaded", () => {
   (function () {
      initSession();
      initMenuSocket();
      initMenuControls();
      initGameSocket();
      initGameControls();
      checkURLForRoom();
   })();
});
