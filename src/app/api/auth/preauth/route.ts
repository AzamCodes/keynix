import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { SERVER_SECRET } from "@/lib/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const PreauthSchema = z.object({
  email: z.string().email(),
});

export const KdfParamsSchema = z.object({
  algorithm: z.literal("argon2id"),
  m: z.number().min(8192).max(1048576),
  t: z.number().min(1).max(10),
  p: z.number().min(1).max(16),
});

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const rateLimit = await checkRateLimit(clientIp, "preauth", 10, 60 * 1000);

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil((rateLimit.reset - Date.now()) / 1000).toString() },
        }
      );
    }

    const body = await req.json();

    const parseResult = PreauthSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid email address format" },
        { status: 400 }
      );
    }

    const { email } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      let parsedKdf;
      try {
        parsedKdf = JSON.parse(user.kdfParams);
        const kdfValid = KdfParamsSchema.safeParse(parsedKdf);
        if (!kdfValid.success) {
          parsedKdf = { algorithm: "argon2id", m: 65536, t: 3, p: 4 };
        }
      } catch {
        parsedKdf = { algorithm: "argon2id", m: 65536, t: 3, p: 4 };
      }

      return NextResponse.json({
        masterSalt: user.masterSalt,
        kdfParams: parsedKdf,
      });
    }

    // Deterministic dummy salt generation for non-existent users to mitigate account enumeration timing attacks
    const dummySaltBuffer = crypto
      .createHmac("sha256", SERVER_SECRET)
      .update(`preauth_salt:${normalizedEmail}`)
      .digest()
      .subarray(0, 16);

    const dummySalt = dummySaltBuffer.toString("base64");

    return NextResponse.json({
      masterSalt: dummySalt,
      kdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
    });
  } catch (error: unknown) {
    console.error("Preauth Error:", error);
    return NextResponse.json(
      { error: "Internal server error during pre-authentication" },
      { status: 500 }
    );
  }
}
