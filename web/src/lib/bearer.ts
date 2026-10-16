import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check of "Authorization: Bearer <secret>". False if the secret is not configured. */
export function hasBearer(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Hashing first makes both sides the same length, so timingSafeEqual never throws or leaks length.
  return timingSafeEqual(digest(token), digest(secret));
}

/** 401 with no body or detail. */
export function unauthorized() {
  return new Response(null, { status: 401 });
}
