import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";
import { checkRateLimit } from "@/lib/rate-limit";

const UpdateVaultItemSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  aadMeta: z.string().max(2048),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = await checkRateLimit(`user:${session.userId}`, "vault-write", 120, 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Too many vault requests" }, { status: 429 });

  const { id } = await params;

  try {
    const body = await readLimitedJson(req, 1024 * 1024);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
    const parseResult = UpdateVaultItemSchema.safeParse(body.value);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid vault item update payload" },
        { status: 400 }
      );
    }

    const { ciphertext, iv, tag, aadMeta } = parseResult.data;
    let parsedAad;
    try {
      parsedAad = JSON.parse(aadMeta);
    } catch {
      return NextResponse.json({ error: "Invalid AAD metadata" }, { status: 400 });
    }
    if (
      !parsedAad ||
      typeof parsedAad !== "object" ||
      parsedAad.userId !== session.userId ||
      parsedAad.itemId !== id ||
      parsedAad.version !== 2
    ) {
      return NextResponse.json({ error: "AAD metadata mismatch" }, { status: 400 });
    }

    const existing = await db.vaultItem.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const updated = await db.vaultItem.update({
      where: { id, userId: session.userId },
      data: {
        ciphertext,
        iv,
        tag,
        aadMeta,
      },
    });

    return NextResponse.json({
      success: true,
      item: {
        id: updated.id,
        userId: updated.userId,
        ciphertext: updated.ciphertext,
        iv: updated.iv,
        tag: updated.tag,
        aadMeta: updated.aadMeta,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: unknown) {
    console.error("Update Vault Item Error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = await checkRateLimit(`user:${session.userId}`, "vault-delete", 120, 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Too many vault requests" }, { status: 429 });

  const { id } = await params;

  try {
    const existing = await db.vaultItem.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await db.vaultItem.delete({
      where: { id, userId: session.userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Delete Vault Item Error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
