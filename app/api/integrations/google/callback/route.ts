import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Platform } from "@/lib/enums";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { exchangeGoogleCode, fetchGoogleAdAccounts } from "@/lib/google-ads-api";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error)}`, req.url),
    );
  }

  const expected = cookies().get("google_oauth_state")?.value;
  const usingMocks = !process.env.GOOGLE_CLIENT_ID;
  if (!usingMocks && (!state || !expected || state !== expected)) {
    return NextResponse.redirect(
      new URL("/integrations?error=invalid_state", req.url),
    );
  }
  cookies().delete("google_oauth_state");

  if (!code) {
    return NextResponse.redirect(
      new URL("/integrations?error=missing_code", req.url),
    );
  }

  try {
    const token = await exchangeGoogleCode(code);
    const accounts = await fetchGoogleAdAccounts(token.accessToken);
    if (accounts.length === 0) {
      return NextResponse.redirect(
        new URL("/integrations?error=no_ad_accounts", req.url),
      );
    }
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000);
    for (const account of accounts) {
      await prisma.adAccount.upsert({
        where: {
          userId_platform_externalId: {
            userId: user.id,
            platform: Platform.GOOGLE,
            externalId: account.externalId,
          },
        },
        create: {
          userId: user.id,
          platform: Platform.GOOGLE,
          externalId: account.externalId,
          name: account.name,
          currency: account.currency ?? "EUR",
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt: expiresAt,
        },
        update: {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? undefined,
          tokenExpiresAt: expiresAt,
          name: account.name,
        },
      });
    }
    return NextResponse.redirect(
      new URL("/integrations?connected=google", req.url),
    );
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        `/integrations?error=${encodeURIComponent((err as Error).message)}`,
        req.url,
      ),
    );
  }
}
