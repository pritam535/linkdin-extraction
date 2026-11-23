import { NextResponse } from "next/server";
import { canPost, clearConnection, loadConnection, oauthApp } from "@/lib/connection";

export const runtime = "nodejs";

// Never returns the token: only who is connected and until when.
export async function GET() {
  const [c, app] = await Promise.all([loadConnection(), oauthApp()]);
  return NextResponse.json({
    appConfigured: Boolean(app.clientId && app.clientSecret),
    redirectUri: app.redirectUri,
    connected: Boolean(c && new Date(c.expiresAt) > new Date()),
    expired: Boolean(c && new Date(c.expiresAt) <= new Date()),
    name: c?.name ?? null,
    picture: c?.picture ?? null,
    expiresAt: c?.expiresAt ?? null,
    scope: c?.scope ?? null,
    canPost: canPost(c), // false = reconnect needed, null = unknown
    requestedScopes: process.env.LINKEDIN_SCOPES || "openid profile w_member_social",
  });
}

export async function DELETE() {
  await clearConnection();
  return NextResponse.json({ ok: true });
}
