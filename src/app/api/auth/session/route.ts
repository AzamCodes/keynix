import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { user } = session;

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      masterSalt: user.masterSalt,
      kdfParams: JSON.parse(user.kdfParams),
      encryptedVaultKey: JSON.parse(user.encryptedVaultKey),
      recoveryEncryptedKey: user.recoveryEncryptedKey
        ? JSON.parse(user.recoveryEncryptedKey)
        : null,
      recoveryEncryptedKeyV2: user.recoveryEncryptedKeyV2
        ? JSON.parse(user.recoveryEncryptedKeyV2)
        : null,
    },
  });
}
