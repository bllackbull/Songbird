import { describe, test, expect } from "vitest";
import { createKnexInstance } from "../../db/knex.js";

describe("Knex DB Connection Factory", () => {
  test("creates better-sqlite3 knex instance by default", () => {
    const instance = createKnexInstance();
    expect(instance.client.config.client).toBe("better-sqlite3");
    expect(instance.client.config.useNullAsDefault).toBe(true);
    instance.destroy();
  });

  test("creates postgres knex instance when DB_CLIENT=postgres", () => {
    process.env.DB_CLIENT = "postgres";
    const instance = createKnexInstance();
    expect(instance.client.config.client).toBe("pg");
    instance.destroy();
    delete process.env.DB_CLIENT;
  });
});
