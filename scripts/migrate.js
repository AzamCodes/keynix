/**
 * Keynix Safe Database Migration Runner for Vercel & Neon
 * Ensures migrations only execute in appropriate environments without targeting Production DB from Preview builds.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync } = require("child_process");

function runMigration() {
  const vercelEnv = process.env.VERCEL_ENV;
  const dbUrl = process.env.DATABASE_URL || "";
  const directUrl = process.env.DIRECT_URL || "";

  console.log(`[Keynix DB Migration Guard] Detected VERCEL_ENV: ${vercelEnv || "local/manual"}`);

  if (vercelEnv === "preview") {
    console.log("⚠️ Vercel Preview deployment detected. Skipping automatic migration against Production database.");
    console.log("👉 Preview environments must connect to a separate Neon database branch.");
    process.exit(0);
  }

  // Inspect database connection target hostname securely without revealing credentials
  try {
    if (directUrl) {
      const parsed = new URL(directUrl.replace("postgresql://", "http://"));
      console.log(`[Keynix DB Migration Guard] Target database host: ${parsed.hostname}`);
    } else if (dbUrl) {
      const parsed = new URL(dbUrl.replace("postgresql://", "http://"));
      console.log(`[Keynix DB Migration Guard] Target database host: ${parsed.hostname}`);
    }
  } catch {
    console.log("[Keynix DB Migration Guard] Could not parse DB host format safely.");
  }

  console.log("🚀 Executing Prisma DB migration (npx prisma migrate deploy)...");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    console.log("✅ Database migration executed successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

runMigration();
