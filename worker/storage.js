import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";

const toBool = (v) =>
  v === undefined ? true : String(v) === "true" || v === true;

export function createStorage({
  endpoint,
  region,
  bucket,
  accessKeyId,
  secretAccessKey,
  forcePathStyle,
}) {
  const client = new S3Client({
    region: region || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: toBool(forcePathStyle),
    ...(endpoint ? { endpoint } : {}),
  });

  const downloadToPath = async (key, filePath) => {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    await pipeline(res.Body, fs.createWriteStream(filePath));
  };

  const uploadFile = async (key, filePath, contentType) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      }),
    );
  };

  return { downloadToPath, uploadFile };
}
