/**
 * Wire format for cards: two-character strings like "As", "Td", "2c".
 * The engine packs cards into ints internally; everything that crosses a
 * process or network boundary uses this representation.
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["c", "d", "h", "s"] as const;

export type RankChar = (typeof RANKS)[number];
export type SuitChar = (typeof SUITS)[number];
export type CardString = `${RankChar}${SuitChar}`;

export const HAND_CATEGORY_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
] as const;
export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
