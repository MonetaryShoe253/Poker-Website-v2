import { io, type Socket } from "socket.io-client";

/**
 * Singleton socket. P2 dev identity: nickname from localStorage. P3 swaps
 * this for the authenticated session (cookies ride along automatically).
 */
let socket: Socket | null = null;

export function getNickname(): string | null {
  return localStorage.getItem("uos-poker:nickname");
}

export function setNickname(nickname: string): void {
  localStorage.setItem("uos-poker:nickname", nickname);
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    const nickname = getNickname();
    socket = io({
      transports: ["websocket"],
      // Session cookies ride the upgrade request; the dev nickname is a
      // non-production fallback the server only honours without a session.
      auth: nickname ? { nickname } : {},
    });
  }
  return socket;
}

/** Drop and rebuild the connection (after sign-in/out or onboarding). */
export function resetSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
