import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, adAccount: { userId: user.id } },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id: campaign.id } });
  return NextResponse.json({ ok: true });
}
