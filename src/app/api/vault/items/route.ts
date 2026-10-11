import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";
import { checkRateLimit } from "@/lib/rate-limit";

const CreateVaultItemSchema = z.object({
  ciphertext: z.string(),
  iv: z.string(),
  tag: z.string(),
  aadMeta: z.string().max(2048), // JSON string containing { itemId, userId, version }
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await checkRateLimit(`user:${session.userId}`, "vault-read", 600, 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Too many vault requests" }, { status: 429 });

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
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = await checkRateLimit(`user:${session.userId}`, "vault-write", 120, 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Too many vault requests" }, { status: 429 });

  try {
    const body = await readLimitedJson(req, 1024 * 1024);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
    const parseResult = CreateVaultItemSchema.safeParse(body.value);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid vault item format", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { ciphertext, iv, tag, aadMeta } = parseResult.data;

    // Reject legacy-client writes. V1 creation authenticated a client-generated
    // ID that was not the canonical database row ID, so accepting more V1
    // records would expand the legacy substitution exposure.
    let parsedAad;
    try {
      parsedAad = JSON.parse(aadMeta);
    } catch {
      return NextResponse.json({ error: "Invalid AAD metadata JSON" }, { status: 400 });
    }

    if (
      !parsedAad ||
      typeof parsedAad !== "object" ||
      parsedAad.userId !== session.userId ||
      typeof parsedAad.itemId !== "string" ||
      !z.string().uuid().safeParse(parsedAad.itemId).success ||
      parsedAad.version !== 2
    ) {
      return NextResponse.json({ error: "Unsupported or mismatched AAD metadata" }, { status: 400 });
    }

    const item = await db.vaultItem.create({
      data: {
        id: parsedAad.itemId,
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
