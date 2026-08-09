import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFile = promisify(nodeExecFile);

export function isPostgresConfig(config) {
  return config?.client === "postgres";
}

function decodeUrlConfig(url, fallback) {
  if (!url) return fallback;
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(
      "POSTGRES_URL must use the postgres:// or postgresql:// protocol.",
    );
  }
  return {
    host: parsed.hostname || fallback.host,
    port: Number(parsed.port || fallback.port),
    user: decodeURIComponent(parsed.username || fallback.user),
    password: decodeURIComponent(parsed.password || fallback.password),
    database: decodeURIComponent(
      parsed.pathname.replace(/^\//, "") || fallback.database,
    ),
    ssl: parsed.searchParams.get("sslmode") === "require" || fallback.ssl,
  };
}

export function resolvePostgresCliConfig(config) {
  if (!isPostgresConfig(config)) {
    throw new Error("PostgreSQL maintenance requires DB_CLIENT=postgres.");
  }
  const connection = decodeUrlConfig(
    config.postgres?.url,
    config.postgres || {},
  );
  if (!connection.host || !connection.user || !connection.database) {
    throw new Error("PostgreSQL host, user, and database must be configured.");
  }
  if (
    !["postgres", "template0", "template1"].includes(
      connection.database.toLowerCase(),
    )
  ) {
    return connection;
  }
  throw new Error(
    "Refusing to run maintenance against a PostgreSQL system database.",
  );
}

function toolEnv(connection) {
  const env = {};
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.PGHOST = connection.host;
  env.PGPORT = String(connection.port || 5432);
  env.PGUSER = connection.user;
  if (connection.password) env.PGPASSWORD = connection.password;
  if (connection.ssl) env.PGSSLMODE = "require";
  return env;
}

function connectionArgs(connection, { includeDatabase = true } = {}) {
  const args = [
    `--host=${connection.host}`,
    `--port=${connection.port || 5432}`,
    `--username=${connection.user}`,
  ];
  if (includeDatabase) args.push(`--dbname=${connection.database}`);
  return args;
}

function assertArchivePath(archivePath) {
  const resolved = path.resolve(String(archivePath || ""));
  if (path.extname(resolved).toLowerCase() !== ".dump") {
    throw new Error("PostgreSQL backups must use the .dump extension.");
  }
  return resolved;
}

function commandError(tool, error) {
  if (error?.code === "ENOENT") {
    return new Error(`${tool} is not installed or is unavailable in PATH.`);
  }
  return new Error(
    `${tool} failed. Check PostgreSQL permissions and server logs.`,
  );
}

export function createPostgresMaintenance({ config, execute = execFile } = {}) {
  const connection = resolvePostgresCliConfig(config);
  const run = async (tool, args) => {
    try {
      return await execute(tool, args, {
        env: toolEnv(connection),
        windowsHide: true,
      });
    } catch (error) {
      throw commandError(tool, error);
    }
  };

  return {
    engine: "postgres",
    backupExtension: ".dump",
    async backup(archivePath) {
      const destination = assertArchivePath(archivePath);
      await run("pg_dump", [
        "--format=custom",
        `--file=${destination}`,
        "--no-owner",
        "--no-privileges",
        ...connectionArgs(connection),
      ]);
      return destination;
    },
    async verifyArchive(archivePath) {
      const source = assertArchivePath(archivePath);
      await run("pg_restore", ["--list", source]);
      return source;
    },
    async restore(archivePath) {
      const source = await this.verifyArchive(archivePath);
      await run("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--single-transaction",
        ...connectionArgs(connection),
        source,
      ]);
    },
    async vacuum() {
      await run("vacuumdb", ["--analyze", ...connectionArgs(connection)]);
    },
    async dropDatabase() {
      await run("dropdb", [
        "--if-exists",
        "--force",
        ...connectionArgs(connection, { includeDatabase: false }),
        connection.database,
      ]);
    },
    async createDatabase() {
      await run("createdb", [
        `--owner=${connection.user}`,
        ...connectionArgs(connection, { includeDatabase: false }),
        connection.database,
      ]);
    },
  };
}
