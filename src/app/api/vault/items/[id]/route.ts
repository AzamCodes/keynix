import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

const UpdateVaultItemSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  aadMeta: z.string(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const parseResult = UpdateVaultItemSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid vault item update payload" },
        { status: 400 }
      );
    }

    const existing = await db.vaultItem.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const { ciphertext, iv, tag, aadMeta } = parseResult.data;

    const updated = await db.vaultItem.update({
      where: { id },
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
  } catch (error: any) {
    console.error("Update Vault Item Error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await db.vaultItem.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await db.vaultItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete Vault Item Error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
