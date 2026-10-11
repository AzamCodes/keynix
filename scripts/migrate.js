// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execFileSync } = require("node:child_process");

const PRODUCTION_APPROVAL = "APPROVED: keynix production migration";

function getHost(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function evaluateMigrationEnvironment(env) {
  const target = env.KEYNIX_MIGRATION_TARGET;
  if (!["local", "preview", "production"].includes(target)) {
    return { allowed: false, reason: "Set an explicit KEYNIX_MIGRATION_TARGET (local, preview, or production)." };
  }

  if (env.VERCEL_ENV === "preview" || target === "preview") {
    return { allowed: false, reason: "Preview migrations are disabled; migrate an explicitly verified non-Preview target instead." };
  }

  if (env.VERCEL_ENV === "production" && target !== "production") {
    return { allowed: false, reason: "Vercel Production requires the production migration target." };
  }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production" && env.VERCEL_ENV !== "preview" && target !== "local") {
    return { allowed: false, reason: "The selected migration target conflicts with the Vercel environment." };
  }

  const directHost = getHost(env.DIRECT_URL);
  const expectedHost = env.KEYNIX_EXPECTED_DIRECT_DATABASE_HOST?.trim().toLowerCase();
  if (!directHost || !expectedHost || directHost !== expectedHost) {
    return { allowed: false, reason: "DIRECT_URL is missing or does not match the explicitly expected database host." };
  }

  if (target === "local" && !["localhost", "127.0.0.1", "::1"].includes(directHost)) {
    return { allowed: false, reason: "Local migrations are limited to loopback database hosts." };
  }

  if (target === "production") {
    if (env.VERCEL_ENV !== "production") {
      return { allowed: false, reason: "Production migrations must run in an explicitly configured Vercel Production environment." };
    }
    if (env.KEYNIX_PRODUCTION_MIGRATION_APPROVAL !== PRODUCTION_APPROVAL) {
      return { allowed: false, reason: "Production migration approval was not explicitly provided." };
    }
  }

  return { allowed: true, reason: "Migration target checks passed." };
}

function runMigration({ env = process.env, execute = execFileSync, log = console.log, fail = process.exit } = {}) {
  const decision = evaluateMigrationEnvironment(env);
  if (!decision.allowed) {
    log(`[Keynix DB Migration Guard] Refusing to migrate: ${decision.reason}`);
    return false;
  }

  log("[Keynix DB Migration Guard] Target checks passed; running Prisma migrations.");
  try {
    const prismaCli = require.resolve("prisma/build/index.js");
    execute(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit", env });
    log("[Keynix DB Migration Guard] Migration command completed.");
    return true;
  } catch {
    log("[Keynix DB Migration Guard] Migration command failed.");
    fail(1);
    return false;
  }
}

if (require.main === module) runMigration();

module.exports = { evaluateMigrationEnvironment, getHost, runMigration };
