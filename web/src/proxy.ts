import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/login"];
const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Runs before every page request:
 * - refreshes the Supabase session cookie,
 * - sends signed-out users to /login,
 * - blocks deactivated users,
 * - forces users with a temporary password to /change-password.
 * Pages and server actions re-check roles themselves; this is the first gate, not the only one.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);

  // Keeps any refreshed session cookies on redirects.
  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to.split("?")[0];
    url.search = to.includes("?") ? to.slice(to.indexOf("?")) : "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (!userId) {
    return isPublic ? response : redirectTo("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return path === "/login" ? response : redirectTo("/login?error=deactivated");
  }

  if (profile.must_change_password) {
    return path === CHANGE_PASSWORD_PATH ? response : redirectTo(CHANGE_PASSWORD_PATH);
  }

  if (isPublic || path === CHANGE_PASSWORD_PATH) {
    return redirectTo("/");
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except API routes (they authenticate themselves), Next internals and static files.
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
