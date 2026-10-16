import "server-only";
import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I), since people type these by hand.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALL = UPPER + LOWER + DIGIT;

/** A 14-character temporary password with at least one upper, lower and digit. */
export function generateTempPassword(length = 14): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export const MIN_PASSWORD_LENGTH = 8;
