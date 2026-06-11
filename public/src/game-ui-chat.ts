import type { ChatMessage } from "@shared/chat";
import { gs } from "./session";

export function updateUIAllChat(): void {
	const panel = document.querySelector("#chat-messages");
	if (!panel) return;

	panel.innerHTML = "";
	for (const group of groupChatMessages(gs.room.chat.messages))
		panel.append(createChatGroupElement(group));
	panel.scrollTop = panel.scrollHeight;
}

export function updateUIPushChat(message: ChatMessage): void {
	const panel = document.querySelector("#chat-messages");
	if (!panel) return;

	const lastGroup = panel.lastElementChild as HTMLElement | null;
	if (lastGroup?.dataset.senderId === message.id) {
		appendChatMessageToGroup(lastGroup, message);
		panel.scrollTop = panel.scrollHeight;
		return;
	}

	panel.append(createChatGroupElement([message]));
	panel.scrollTop = panel.scrollHeight;
}

export function sendChatMessage(sourceInput?: HTMLInputElement): void {
	const input =
		sourceInput ?? (document.querySelector("#chat-input") as HTMLInputElement);

	const message = input?.value?.trim();
	if (message && message.length > 0) {
		gs.socket.emit("send-chat", message);
		if (input) input.value = "";
	}
}

function groupChatMessages(messages: ChatMessage[]): ChatMessage[][] {
	const groups: ChatMessage[][] = [];
	for (const message of messages) {
		const previousGroup = groups[groups.length - 1];
		const previousMessage = previousGroup?.[previousGroup.length - 1];
		if (previousMessage?.id === message.id) {
			previousGroup.push(message);
		} else {
			groups.push([message]);
		}
	}
	return groups;
}

function createChatGroupElement(messages: ChatMessage[]): HTMLDivElement {
	const firstMessage = messages[0];
	const group = document.createElement("div");
	group.className =
		`chat-message ${firstMessage.id === gs.player.id ? "own" : ""} ${firstMessage.id === "server" ? "server" : ""}`.trim();
	group.dataset.senderId = firstMessage.id;

	const sender = document.createElement("div");
	sender.className = "chat-sender";
	sender.textContent = getChatSenderName(firstMessage.id);
	group.append(sender);

	const body = document.createElement("div");
	body.className = "chat-message-body";
	for (const message of messages) {
		const line = document.createElement("div");
		line.className = "chat-text";
		line.textContent = message.message;
		body.append(line);
	}

	group.append(body);
	return group;
}

function appendChatMessageToGroup(group: HTMLElement, message: ChatMessage): void {
	const body = group.querySelector(".chat-message-body");
	if (!body) return;

	const line = document.createElement("div");
	line.className = "chat-text";
	line.textContent = message.message;
	body.append(line);
}

function getChatSenderName(id: string): string {
	if (id === gs.player.id) return gs.room.players.get(id)?.name ?? gs.player.name ?? "Unknown";
	if (id === "server") return "Game";
	return gs.room.players.get(id)?.name ?? "Unknown";
}
