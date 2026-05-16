import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { buildGoogleAuthUrl } from "@/lib/google-ads-api";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = randomBytes(16).toString("hex");
  cookies().set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
