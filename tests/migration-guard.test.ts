import { describe, expect, it, vi } from "vitest";

// The migration command is injected in every test; none can execute Prisma.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluateMigrationEnvironment, runMigration } = require("../scripts/migrate.js");

const localEnvironment = {
  KEYNIX_MIGRATION_TARGET: "local",
  KEYNIX_EXPECTED_DIRECT_DATABASE_HOST: "localhost",
  DIRECT_URL: "postgresql://synthetic:synthetic@localhost:5432/keynix",
};

describe("migration target guard", () => {
  it("fails closed when target or direct-host confirmation is absent", () => {
    expect(evaluateMigrationEnvironment({})).toMatchObject({ allowed: false });
    expect(evaluateMigrationEnvironment({ ...localEnvironment, KEYNIX_EXPECTED_DIRECT_DATABASE_HOST: undefined }))
      .toMatchObject({ allowed: false });
  });

  it("allows a matching, explicitly selected synthetic local target", () => {
    expect(evaluateMigrationEnvironment(localEnvironment)).toMatchObject({ allowed: true });
  });

  it("never migrates Preview even if its URL host is explicitly confirmed", () => {
    expect(evaluateMigrationEnvironment({
      ...localEnvironment,
      KEYNIX_MIGRATION_TARGET: "preview",
      VERCEL_ENV: "preview",
    })).toMatchObject({ allowed: false });
  });

  it("refuses remote database hosts for a local migration target", () => {
    expect(evaluateMigrationEnvironment({
      ...localEnvironment,
      KEYNIX_EXPECTED_DIRECT_DATABASE_HOST: "production.synthetic.test",
      DIRECT_URL: "postgresql://synthetic:synthetic@production.synthetic.test:5432/keynix",
    })).toMatchObject({ allowed: false });
  });

  it("requires Production environment, matching host, and explicit approval", () => {
    const production = {
      KEYNIX_MIGRATION_TARGET: "production",
      KEYNIX_EXPECTED_DIRECT_DATABASE_HOST: "production.synthetic.test",
      DIRECT_URL: "postgresql://synthetic:synthetic@production.synthetic.test:5432/keynix",
      VERCEL_ENV: "production",
    };

    expect(evaluateMigrationEnvironment(production)).toMatchObject({ allowed: false });
    expect(evaluateMigrationEnvironment({
      ...production,
      KEYNIX_PRODUCTION_MIGRATION_APPROVAL: "APPROVED: keynix production migration",
    })).toMatchObject({ allowed: true });
    expect(evaluateMigrationEnvironment({
      ...production,
      KEYNIX_EXPECTED_DIRECT_DATABASE_HOST: "other.synthetic.test",
      KEYNIX_PRODUCTION_MIGRATION_APPROVAL: "APPROVED: keynix production migration",
    })).toMatchObject({ allowed: false });
  });

  it("refuses without invoking Prisma and never logs connection values", () => {
    const execute = vi.fn();
    const output: string[] = [];
    const result = runMigration({
      env: { ...localEnvironment, DIRECT_URL: "not-a-valid-database-url" },
      execute,
      log: (message: string) => output.push(message),
    });

    expect(result).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(output.join(" ")).not.toContain("not-a-valid-database-url");
  });

  it("executes only the Prisma deploy command when all local checks pass", () => {
    const execute = vi.fn();
    const result = runMigration({ env: localEnvironment, execute, log: vi.fn() });

    expect(result).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/prisma[\\/]build[\\/]index\.js$/), "migrate", "deploy"],
      expect.objectContaining({ stdio: "inherit", env: localEnvironment })
    );
  });
});
