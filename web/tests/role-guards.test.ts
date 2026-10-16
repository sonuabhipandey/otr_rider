// Role guards for every protected server action and the automation/cron endpoints.
// The real authorize()/getCurrentProfile() run; only the session lookup is faked. The service-role
// client is replaced by one that throws, so any action that touched the database before checking
// the caller's role would fail these tests.
import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeProfile = {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin";
  is_active: boolean;
  must_change_password: boolean;
};

const session = vi.hoisted(() => ({ profile: null as FakeProfile | null }));
const adminClientUsed = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: session.profile ? { claims: { sub: session.profile.id } } : null }),
      getUser: async () => ({ data: { user: session.profile ? { id: session.profile.id } : null } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session.profile }) }) }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminClientUsed.count++;
    throw new Error("service-role client used");
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const UUID = "00000000-0000-4000-8000-000000000001";

const profiles: Record<string, FakeProfile | null> = {
  "signed out": null,
  admin: { id: UUID, email: "a@x.test", full_name: "A", role: "admin", is_active: true, must_change_password: false },
  "deactivated superadmin": { id: UUID, email: "s@x.test", full_name: "S", role: "superadmin", is_active: false, must_change_password: false },
  "superadmin on temporary password": { id: UUID, email: "s@x.test", full_name: "S", role: "superadmin", is_active: true, must_change_password: true },
};
const superadmin: FakeProfile = { id: UUID, email: "s@x.test", full_name: "S", role: "superadmin", is_active: true, must_change_password: false };

const NOT_ALLOWED = { ok: false, error: "You are not allowed to do this." };

async function superadminOnlyActions() {
  const users = await import("@/app/(app)/admin/users/actions");
  const uploads = await import("@/app/(app)/admin/uploads/actions");
  const settings = await import("@/app/(app)/admin/settings/actions");
  return {
    "users.createUser": () => users.createUser({ fullName: "X", email: "x@x.test", role: "superadmin" }),
    "users.changeRole": () => users.changeRole(UUID, "superadmin"),
    "users.resetPassword": () => users.resetPassword(UUID),
    "users.setActive": () => users.setActive(UUID, false),
    "uploads.deleteFile": () => uploads.deleteFile(UUID),
    "uploads.deleteAllFiles": () => uploads.deleteAllFiles(),
    "settings.setRetentionDays": () => settings.setRetentionDays(null),
  };
}

async function anyRoleActions() {
  const upload = await import("@/app/(app)/admin/upload/actions");
  const uploads = await import("@/app/(app)/admin/uploads/actions");
  return {
    "upload.startManualUpload": () => upload.startManualUpload({ fileName: "x.csv", sizeBytes: 100 }),
    "upload.processManualUpload": () => upload.processManualUpload(UUID),
    "upload.abandonManualUpload": () => upload.abandonManualUpload(UUID, "x"),
    "uploads.getDownloadUrl": () => uploads.getDownloadUrl(UUID),
  };
}

beforeEach(() => {
  adminClientUsed.count = 0;
});

describe("superadmin-only server actions refuse everyone else", async () => {
  const actions = await superadminOnlyActions();
  for (const [who, profile] of Object.entries(profiles)) {
    for (const [name, call] of Object.entries(actions)) {
      it(`${name} refuses: ${who}`, async () => {
        session.profile = profile;
        await expect(call()).resolves.toEqual(NOT_ALLOWED);
        expect(adminClientUsed.count).toBe(0);
      });
    }
  }

  for (const [name, call] of Object.entries(actions)) {
    it(`${name} lets an active superadmin through to the database`, async () => {
      session.profile = superadmin;
      // Past the role check the action reaches the (throwing) service-role client.
      await call().catch(() => undefined);
      expect(adminClientUsed.count).toBeGreaterThan(0);
    });
  }
});

describe("admin + superadmin actions refuse signed-out, deactivated and temporary-password users", async () => {
  const actions = await anyRoleActions();
  const blocked = Object.entries(profiles).filter(([who]) => who !== "admin");
  for (const [who, profile] of blocked) {
    for (const [name, call] of Object.entries(actions)) {
      it(`${name} refuses: ${who}`, async () => {
        session.profile = profile;
        await expect(call()).resolves.toEqual(NOT_ALLOWED);
        expect(adminClientUsed.count).toBe(0);
      });
    }
  }
});

describe("automation and cron endpoints", () => {
  const KEY = "k".repeat(64);
  const CRON = "c".repeat(64);
  process.env.AUTOMATION_UPLOAD_KEY = KEY;
  process.env.CRON_SECRET = CRON;

  const endpoints = async () => {
    const uploadUrl = await import("@/app/api/automation/upload-url/route");
    const processRoute = await import("@/app/api/automation/process/route");
    const check = await import("@/app/api/automation/check/route");
    const cron = await import("@/app/api/cron/purge-files/route");
    const { NextRequest } = await import("next/server");
    return {
      "POST /api/automation/upload-url": { key: KEY, call: (h: HeadersInit) => uploadUrl.POST(new Request("http://x/api/automation/upload-url", { method: "POST", headers: h, body: "{}" })) },
      "POST /api/automation/process": { key: KEY, call: (h: HeadersInit) => processRoute.POST(new Request("http://x/api/automation/process", { method: "POST", headers: h, body: JSON.stringify({ upload_id: UUID }) })) },
      "GET /api/automation/check": { key: KEY, call: (h: HeadersInit) => check.GET(new NextRequest("http://x/api/automation/check?date=2026-10-15", { headers: h })) },
      "GET /api/cron/purge-files": { key: CRON, call: (h: HeadersInit) => cron.GET(new Request("http://x/api/cron/purge-files", { headers: h })) },
    };
  };

  const badHeaders = (key: string): [string, HeadersInit][] => [
    ["no Authorization header", {}],
    ["wrong key", { Authorization: `Bearer ${"z".repeat(64)}` }],
    ["key with a different length", { Authorization: `Bearer ${key}x` }],
    ["empty bearer", { Authorization: "Bearer " }],
    ["key without the Bearer prefix", { Authorization: key }],
    ["the other endpoint's secret", { Authorization: `Bearer ${key === KEY ? CRON : KEY}` }],
  ];

  it("return 401 with an empty body for every bad key, before touching the database", async () => {
    for (const [name, { key, call }] of Object.entries(await endpoints())) {
      for (const [label, headers] of badHeaders(key)) {
        const res = await call(headers);
        expect(res.status, `${name}: ${label}`).toBe(401);
        expect(await res.text(), `${name}: ${label}`).toBe("");
      }
    }
    expect(adminClientUsed.count).toBe(0);
  });

  it("accept the right key (and only then reach the database)", async () => {
    for (const [name, { key, call }] of Object.entries(await endpoints())) {
      adminClientUsed.count = 0;
      await Promise.resolve(call({ Authorization: `Bearer ${key}` })).catch(() => undefined);
      expect(adminClientUsed.count, name).toBeGreaterThan(0);
    }
  });

  it("refuse everything when the secret is not configured", async () => {
    const { hasBearer } = await import("@/lib/bearer");
    expect(hasBearer(new Request("http://x", { headers: { Authorization: "Bearer " } }), undefined)).toBe(false);
    expect(hasBearer(new Request("http://x", { headers: { Authorization: "Bearer " } }), "")).toBe(false);
  });
});
