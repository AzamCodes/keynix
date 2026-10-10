import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

const CreateVaultItemSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  aadMeta: z.string(), // JSON string containing { itemId, userId, version }
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await db.vaultItem.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      userId: item.userId,
      ciphertext: item.ciphertext,
      iv: item.iv,
      tag: item.tag,
      aadMeta: item.aadMeta,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parseResult = CreateVaultItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid vault item format", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { ciphertext, iv, tag, aadMeta } = parseResult.data;

    // Verify AAD metadata contains matching userId
    let parsedAad;
    try {
      parsedAad = JSON.parse(aadMeta);
    } catch {
      return NextResponse.json({ error: "Invalid AAD metadata JSON" }, { status: 400 });
    }

    if (parsedAad.userId && parsedAad.userId !== session.userId) {
      return NextResponse.json({ error: "AAD userId mismatch" }, { status: 403 });
    }

    const item = await db.vaultItem.create({
      data: {
        userId: session.userId,
        ciphertext,
        iv,
        tag,
        aadMeta,
      },
    });

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        userId: item.userId,
        ciphertext: item.ciphertext,
        iv: item.iv,
        tag: item.tag,
        aadMeta: item.aadMeta,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
    });
  } catch (error: unknown) {
    console.error("Create Vault Item Error:", error);
    return NextResponse.json({ error: "Failed to store vault item" }, { status: 500 });
  }
}
