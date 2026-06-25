import { io, type Socket } from "socket.io-client";

/**
 * Singleton socket. P2 dev identity: nickname from localStorage. P3 swaps
 * this for the authenticated session (cookies ride along automatically).
 */
let socket: Socket | null = null;

const GUEST_KEY = "uos-poker:guest";

export function getNickname(): string | null {
  return localStorage.getItem("uos-poker:nickname");
}

export function setNickname(nickname: string): void {
  localStorage.setItem("uos-poker:nickname", nickname);
  localStorage.removeItem(GUEST_KEY);
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** True when the casual nickname is a production demo guest (practice-only). */
export function isGuest(): boolean {
  return localStorage.getItem(GUEST_KEY) === "1";
}

/**
 * Production demo door: play as a guest under a nickname. The server honours
 * the `guest: true` flag (sent below) and restricts the identity to practice
 * tables + spectating. No account, no persistence.
 */
export function setGuestNickname(nickname: string): void {
  localStorage.setItem("uos-poker:nickname", nickname);
  localStorage.setItem(GUEST_KEY, "1");
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function clearCasualIdentity(): void {
  localStorage.removeItem("uos-poker:nickname");
  localStorage.removeItem(GUEST_KEY);
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
      // Session cookies ride the upgrade request. Without a session the server
      // honours a nickname only as the dev door (non-prod) or, when `guest` is
      // set, the production demo door (practice + spectating only).
      auth: nickname ? { nickname, ...(isGuest() ? { guest: true } : {}) } : {},
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
