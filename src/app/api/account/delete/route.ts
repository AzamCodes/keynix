import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession, destroySession } from "@/lib/session";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.userId;
    await destroySession();

    // Cascading deletion in DB scrubs user, vaultItems, and sessions
    await db.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Delete Account Error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
