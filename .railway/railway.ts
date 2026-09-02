import {
  bucket,
  defineRailway,
  group,
  postgres,
  preserve,
  project,
  ref,
  service,
} from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");
  const uploads = bucket("uploads");

  const worker = service("songbird-worker", {
    rootDirectory: "worker",
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    healthcheckPath: "/health",
    healthcheckTimeout: 100,
    env: {
      APP_ENV: "production",
      WORKER_PORT: "8080",
      WORKER_CONCURRENCY: "2",
      WEBHOOK_SECRET: preserve(),
      STORAGE_DRIVER: "remote",
      STORAGE_BUCKET: ref(uploads, "BUCKET_NAME"),
      STORAGE_ENDPOINT: ref(uploads, "ENDPOINT"),
      STORAGE_REGION: ref(uploads, "REGION"),
      STORAGE_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
      STORAGE_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
      STORAGE_FORCE_PATH_STYLE: "true",
    },
  });

  const app = service("songbird", {
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    healthcheckPath: "/api/health",
    healthcheckTimeout: 100,
    env: {
      APP_ENV: "production",
      BIND_ADDRESS: "0.0.0.0",
      DB_CLIENT: "postgres",
      POSTGRES_URL: db.env.DATABASE_URL,
      POSTGRES_SSL: "false",
      STORAGE_PROCESSING_MODE: "remote",
      WORKER_URL: "http://${{songbird-worker.RAILWAY_PRIVATE_DOMAIN}}:8080",
      WEBHOOK_URL:
        "http://${{songbird.RAILWAY_PRIVATE_DOMAIN}}:${{PORT}}/api/uploads/webhook/processed",
      WEBHOOK_SECRET: preserve(),
      STORAGE_DRIVER: "remote",
      STORAGE_BUCKET: ref(uploads, "BUCKET_NAME"),
      STORAGE_ENDPOINT: ref(uploads, "ENDPOINT"),
      STORAGE_REGION: ref(uploads, "REGION"),
      STORAGE_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
      STORAGE_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
      STORAGE_FORCE_PATH_STYLE: "true",
    },
  });

  const songbirdGroup = group("Songbird", [app, worker, db, uploads]);

  return project("songbird", {
    resources: [songbirdGroup],
  });
});
