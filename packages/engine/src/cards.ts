import { RANKS, SUITS, type CardString } from "@uos-poker/shared";

/**
 * Internal card representation: an int 0..51, rank-major.
 *   card = rank * 4 + suit
 *   rank: 0 = deuce … 12 = ace
 *   suit: 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
 * Wire format ("As", "Td"…) is converted at the boundary only.
 */
export type CardInt = number;

export const rankOf = (c: CardInt): number => c >>> 2;
export const suitOf = (c: CardInt): number => c & 3;
export const makeCard = (rank: number, suit: number): CardInt => rank * 4 + suit;

export function cardToString(c: CardInt): CardString {
  const rank = RANKS[rankOf(c)];
  const suit = SUITS[suitOf(c)];
  if (rank === undefined || suit === undefined) throw new Error(`Invalid card int: ${c}`);
  return `${rank}${suit}`;
}

export function cardFromString(s: string): CardInt {
  const rank = RANKS.indexOf(s[0] as (typeof RANKS)[number]);
  const suit = SUITS.indexOf(s[1] as (typeof SUITS)[number]);
  if (rank === -1 || suit === -1 || s.length !== 2) throw new Error(`Invalid card string: ${s}`);
  return makeCard(rank, suit);
}

export const cardsFromString = (s: string): CardInt[] =>
  s
    .trim()
    .split(/\s+/)
    .map((part) => cardFromString(part));

/** A fresh ordered 52-card deck. */
export const freshDeck = (): CardInt[] => Array.from({ length: 52 }, (_, i) => i);
