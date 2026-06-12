import { NICKNAME } from "./constants";

/**
 * Profanity + nickname policy (§19).
 * Normalisation handles case, common leetspeak, and separator padding.
 * Chat violations render as "▇▇▇" rather than blocking the message.
 */

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
};

export function normalizeForFilter(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

/** Blocked anywhere (substring of the normalised string). */
const BLOCKLIST = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "wanker",
  "bollock",
  "bellend",
  "twat",
  "prick",
  "dickhead",
  "asshole",
  "arsehole",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "paki",
  "spastic",
  "whore",
  "slut",
  "rapist",
  "nonce",
  "paedo",
  "pedo",
  "hitler",
  "nazi",
];

/** Blocked as a whole nickname or as a substring (impersonation / authority). */
const IMPERSONATION_SUBSTRINGS = ["admin", "uospoker", "moderator", "official"];

/** Blocked only as the entire nickname (committee first names from §22). */
const IMPERSONATION_EXACT = [
  "kiran",
  "milan",
  "kit",
  "kat",
  "izzy",
  "ethan",
  "callum",
  "mia",
  "ellie",
  "billy",
  "andy",
  "harry",
];

export function containsProfanity(input: string): boolean {
  const normalized = normalizeForFilter(input);
  return BLOCKLIST.some((word) => normalized.includes(word));
}

/** Replace each profane word-run with block characters; keeps the rest. */
export function filterProfanity(message: string): string {
  // Token-wise pass so clean words survive.
  return message
    .split(/(\s+)/)
    .map((token) => (containsProfanity(token) ? "▇▇▇" : token))
    .join("");
}

export type NicknameVerdict =
  | { ok: true }
  | { ok: false; reason: "length" | "charset" | "profanity" | "impersonation" };

export function validateNickname(nickname: string): NicknameVerdict {
  if (nickname.length < NICKNAME.min || nickname.length > NICKNAME.max) {
    return { ok: false, reason: "length" };
  }
  if (!NICKNAME.pattern.test(nickname)) {
    return { ok: false, reason: "charset" };
  }
  if (containsProfanity(nickname)) {
    return { ok: false, reason: "profanity" };
  }
  const normalized = normalizeForFilter(nickname);
  if (IMPERSONATION_SUBSTRINGS.some((word) => normalized.includes(word))) {
    return { ok: false, reason: "impersonation" };
  }
  if (IMPERSONATION_EXACT.includes(normalized)) {
    return { ok: false, reason: "impersonation" };
  }
  return { ok: true };
}
