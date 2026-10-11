import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generatePreauthDummySalt, getServerSecret } from "@/lib/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";

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
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  try {
    // Check before looking up an account so missing configuration cannot
    // produce different responses for known and unknown emails.
    getServerSecret();

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

    const body = await readLimitedJson(req, 8 * 1024);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

    const parseResult = PreauthSchema.safeParse(body.value);

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
    const dummySalt = generatePreauthDummySalt(normalizedEmail);

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
