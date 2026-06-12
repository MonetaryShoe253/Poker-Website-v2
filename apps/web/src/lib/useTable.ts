import { useEffect, useState } from "react";
import {
  SOCKET_EVENTS as EV,
  type ChatPayload,
  type LobbyStatePayload,
  type TableErrorPayload,
  type TableStatePayload,
} from "@uos-poker/shared";
import { getSocket } from "./socket";

export function useLobby(): LobbyStatePayload | null {
  const [lobby, setLobby] = useState<LobbyStatePayload | null>(null);
  useEffect(() => {
    const socket = getSocket();
    const onState = (state: LobbyStatePayload) => setLobby(state);
    socket.on(EV.lobbyState, onState);
    socket.emit(EV.lobbySubscribe);
    return () => {
      socket.emit(EV.lobbyUnsubscribe);
      socket.off(EV.lobbyState, onState);
    };
  }, []);
  return lobby;
}

export interface TableConnection {
  state: TableStatePayload | null;
  chat: ChatPayload[];
  error: TableErrorPayload | null;
}

export function useTable(): TableConnection {
  const [state, setState] = useState<TableStatePayload | null>(null);
  const [chat, setChat] = useState<ChatPayload[]>([]);
  const [error, setError] = useState<TableErrorPayload | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onState = (s: TableStatePayload) => setState(s);
    const onChat = (c: ChatPayload) => setChat((prev) => [...prev.slice(-49), c]);
    const onError = (e: TableErrorPayload) => {
      setError(e);
      setTimeout(() => setError(null), 4000);
    };
    socket.on(EV.tableState, onState);
    socket.on(EV.tableChat, onChat);
    socket.on(EV.tableError, onError);
    return () => {
      socket.off(EV.tableState, onState);
      socket.off(EV.tableChat, onChat);
      socket.off(EV.tableError, onError);
    };
  }, []);

  return { state, chat, error };
}
