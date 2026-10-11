import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { argv, env, exit } from "node:process";
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptDir, "..");
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });

const HELP = `Apply a browser-upload CORS policy to the S3-compatible storage bucket.

Songbird uploads files straight from the browser to the bucket via presigned
PUT URLs, so the bucket must allow cross-origin requests from your app domain.
Railway buckets ship with no CORS policy and no dashboard toggle for it; run
this script once from any machine with network access (your laptop is fine).

Usage:
  npm run storage:cors -- --origin https://your-app.up.railway.app
  node scripts/configure-bucket-cors.js --origin https://app.example.com --origin https://admin.example.com

Options (flags override environment variables):
  --origin <url>          App origin allowed to upload (repeatable, required
                          unless --show is used). Exact scheme + host, no
                          trailing slash. STORAGE_PUBLIC_URL is NOT an origin.
  --bucket <name>         S3 API bucket name (env STORAGE_BUCKET).
                          For Railway use the hashed BUCKET value, not the
                          display name.
  --endpoint <url>        S3 endpoint (env STORAGE_ENDPOINT).
  --region <name>         Bucket region (env STORAGE_REGION, default "auto").
  --access-key-id <id>    (env STORAGE_ACCESS_KEY_ID)
  --secret-access-key <k> (env STORAGE_SECRET_ACCESS_KEY)
  --path-style <bool>     Force path-style URLs, true/false
                          (env STORAGE_FORCE_PATH_STYLE, default false for
                          virtual-hosted-style providers like Railway buckets)
  --show                  Print the current CORS policy and exit.
  -h, --help              Show this help.

Examples:
  npm run storage:cors -- --origin https://songbird.up.railway.app
  STORAGE_BUCKET=my-bucket-abc123 STORAGE_ENDPOINT=https://storage.railway.app \\
    STORAGE_ACCESS_KEY_ID=xxx STORAGE_SECRET_ACCESS_KEY=yyy \\
    npm run storage:cors -- --origin https://songbird.up.railway.app --show
`;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function parseArgs(args) {
  const options = { origins: [] };
  for (let i = 0; i < args.length; i += 1) {
    const [flag, inline] = args[i].includes("=")
      ? args[i].split(/=(.*)/s, 2)
      : [args[i], undefined];
    const next = () => {
      if (inline !== undefined) return inline;
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value.`);
      }
      i += 1;
      return value;
    };
    switch (flag) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--origin":
        options.origins.push(clean(next()));
        break;
      case "--bucket":
        options.bucket = clean(next());
        break;
      case "--endpoint":
        options.endpoint = clean(next());
        break;
      case "--region":
        options.region = clean(next());
        break;
      case "--access-key-id":
        options.accessKeyId = clean(next());
        break;
      case "--secret-access-key":
        options.secretAccessKey = clean(next());
        break;
      case "--path-style":
        options.pathStyle = clean(next());
        break;
      case "--show":
        options.show = true;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}. Use --help.`);
    }
  }
  return options;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["true", "1", "yes"].includes(String(value).toLowerCase());
}

async function main() {
  const options = parseArgs(argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const bucket = clean(options.bucket ?? env.STORAGE_BUCKET);
  const endpoint = clean(options.endpoint ?? env.STORAGE_ENDPOINT);
  const region = clean(options.region ?? env.STORAGE_REGION) || "auto";
  const accessKeyId = clean(options.accessKeyId ?? env.STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = clean(
    options.secretAccessKey ?? env.STORAGE_SECRET_ACCESS_KEY,
  );
  const forcePathStyle = toBool(
    options.pathStyle ?? env.STORAGE_FORCE_PATH_STYLE,
    false,
  );
  const origins = options.origins.filter(Boolean);

  const missing = [];
  if (!bucket) missing.push("--bucket (STORAGE_BUCKET)");
  if (!endpoint) missing.push("--endpoint (STORAGE_ENDPOINT)");
  if (!accessKeyId) missing.push("--access-key-id (STORAGE_ACCESS_KEY_ID)");
  if (!secretAccessKey)
    missing.push("--secret-access-key (STORAGE_SECRET_ACCESS_KEY)");
  if (!options.show && origins.length === 0)
    missing.push("--origin (at least one app origin)");
  if (missing.length > 0) {
    console.error(`Missing required options:\n  ${missing.join("\n  ")}`);
    exit(1);
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  if (options.show) {
    try {
      const current = await client.send(
        new GetBucketCorsCommand({ Bucket: bucket }),
      );
      console.log(JSON.stringify(current.CORSRules ?? [], null, 2));
    } catch (err) {
      if (err?.name === "NoSuchCORSConfiguration") {
        console.log("No CORS configuration set on this bucket.");
      } else {
        throw err;
      }
    }
    return;
  }

  const corsConfiguration = {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
        AllowedOrigins: origins,
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
  };

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfiguration,
    }),
  );
  console.log(`CORS policy applied to bucket "${bucket}":`);
  console.log(JSON.stringify(corsConfiguration.CORSRules, null, 2));

  const verify = await client.send(
    new GetBucketCorsCommand({ Bucket: bucket }),
  );
  console.log("Verified live policy:");
  console.log(JSON.stringify(verify.CORSRules ?? [], null, 2));
}

main().catch((err) => {
  console.error(`Failed: ${err?.message || err}`);
  exit(1);
});
