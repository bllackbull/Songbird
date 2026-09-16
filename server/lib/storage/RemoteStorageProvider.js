import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { pipeline } from "node:stream/promises";
import { HttpsProxyAgent } from "https-proxy-agent";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { StorageProvider } from "./StorageProvider.js";

export class RemoteStorageProvider extends StorageProvider {
  constructor(config = {}) {
    super();
    this.type = config.type || "remote";
    this.bucket = config.bucket || config.STORAGE_BUCKET;
    this.region = config.region || config.STORAGE_REGION || "auto";
    this.endpoint = config.endpoint || config.STORAGE_ENDPOINT;
    this.publicUrl = config.publicUrl || config.STORAGE_PUBLIC_URL;
    this.expiresIn = Number(
      config.expiresIn || config.STORAGE_EXPIRES_IN || 3600,
    );

    const accessKeyId =
      config.accessKeyId ||
      config.STORAGE_ACCESS_KEY_ID ||
      config.credentials?.accessKeyId;
    const secretAccessKey =
      config.secretAccessKey ||
      config.STORAGE_SECRET_ACCESS_KEY ||
      config.credentials?.secretAccessKey;

    const forcePathStyleVal =
      config.forcePathStyle !== undefined
        ? config.forcePathStyle
        : config.STORAGE_FORCE_PATH_STYLE;

    const forcePathStyle =
      forcePathStyleVal !== undefined
        ? String(forcePathStyleVal) === "true" || forcePathStyleVal === true
        : true;

    const proxyUrl =
      config.proxyUrl ||
      config.STORAGE_PROXY_URL ||
      process.env.STORAGE_PROXY_URL ||
      process.env.HTTPS_PROXY ||
      process.env.ALL_PROXY ||
      process.env.HTTP_PROXY ||
      null;

    this.proxyUrl = proxyUrl;
    this.proxyAgent = null;
    if (proxyUrl) {
      try {
        this.proxyAgent = new HttpsProxyAgent(proxyUrl);
      } catch (_) {
        this.proxyAgent = null;
      }
    }

    if (config.s3Client) {
      this.client = config.s3Client;
    } else {
      const clientConfig = {
        region: this.region,
        credentials: {
          accessKeyId: accessKeyId || "",
          secretAccessKey: secretAccessKey || "",
        },
        forcePathStyle,
      };
      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
      }
      if (this.proxyAgent) {
        clientConfig.requestHandler = new NodeHttpHandler({
          httpAgent: this.proxyAgent,
          httpsAgent: this.proxyAgent,
        });
      }
      this.client = new S3Client(clientConfig);
    }
  }

  async _sendPresignedRequest(url, method = "GET", body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;
      const opts = {
        method,
        headers: { ...headers },
      };
      if (this.proxyAgent) {
        opts.agent = this.proxyAgent;
      }
      const req = transport.request(url, opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const resBody = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: resBody });
          } else {
            const err = new Error(`Request to ${url} failed with status ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = resBody;
            reject(err);
          }
        });
      });
      req.on("error", reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * Presigned PUT URL for upload.
   * @param {string|object} fileInfo
   * @param {object} [options]
   * @returns {Promise<{type: 's3', uploadUrl: string}>}
   */
  async getUploadUrl(fileInfo, options = {}) {
    const key =
      typeof fileInfo === "string"
        ? fileInfo
        : fileInfo?.key ||
          fileInfo?.filename ||
          fileInfo?.storedName ||
          fileInfo?.name;

    const contentType =
      typeof fileInfo === "object"
        ? fileInfo?.contentType
        : options?.contentType;

    const expiresIn =
      (typeof fileInfo === "object" && fileInfo?.expiresIn) ||
      options?.expiresIn ||
      this.expiresIn;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    return {
      type: "remote",
      uploadUrl,
    };
  }

  /**
   * Presigned POST (browser form upload) with a bucket-enforced policy.
   * @param {object} fileInfo { key, contentType, maxSizeBytes, expiresIn }
   * @returns {Promise<{url: string, fields: object}>}
   */
  async getPresignedPost(fileInfo = {}) {
    const cleanKey = String(fileInfo?.key || "").replace(/^\//, "");
    if (!cleanKey) {
      throw new Error("getPresignedPost requires a key.");
    }
    const contentType = String(
      fileInfo?.contentType || "application/octet-stream",
    );
    const maxSizeBytes = Number(fileInfo?.maxSizeBytes);
    if (!Number.isFinite(maxSizeBytes) || maxSizeBytes <= 0) {
      throw new Error("getPresignedPost requires a positive maxSizeBytes.");
    }
    const expiresIn =
      Number(fileInfo?.expiresIn) || this.expiresIn || 3600;

    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: cleanKey,
      Conditions: [
        ["eq", "$key", cleanKey],
        ["eq", "$Content-Type", contentType],
        ["content-length-range", 1, Math.floor(maxSizeBytes)],
      ],
      Fields: {
        "Content-Type": contentType,
      },
      Expires: expiresIn,
    });
    return { url, fields };
  }

  /**
   * Upload raw buffer or stream directly to S3/R2.
   * @param {string} fileKey
   * @param {Buffer|Uint8Array|string} body
   * @param {string} [contentType]
   * @returns {Promise<{key: string}>}
   */
  async uploadBuffer(fileKey, body, contentType = "application/octet-stream") {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: buf,
      ContentLength: buf.length,
      ContentType: contentType,
    });
    try {
      await this.client.send(command);
      return { key: cleanKey };
    } catch (err) {
      try {
        const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
        await this._sendPresignedRequest(signedUrl, "PUT", buf, {
          "Content-Type": contentType,
          "Content-Length": String(buf.length),
        });
        return { key: cleanKey };
      } catch (_) {
        throw err;
      }
    }
  }

  /**
   * Get download URL (presigned GET or public CDN URL).
   * @param {string} fileKey
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async getDownloadUrl(fileKey, options = {}) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");

    if (this.publicUrl) {
      const base = this.publicUrl.replace(/\/$/, "");
      return `${base}/${cleanKey}`;
    }

    const expiresIn = options?.expiresIn || this.expiresIn;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Read the bucket CORS policy. Returns [] when none is configured.
   * @returns {Promise<object[]>}
   */
  async getCorsRules() {
    try {
      const res = await this.client.send(
        new GetBucketCorsCommand({ Bucket: this.bucket }),
      );
      return res?.CORSRules || [];
    } catch (err) {
      if (err?.name === "NoSuchCORSConfiguration") return [];
      throw err;
    }
  }

  /**
   * Replace the bucket CORS policy with the given rules.
   * @param {object[]} rules
   * @returns {Promise<boolean>}
   */
  async setCorsRules(rules) {
    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: { CORSRules: rules },
      }),
    );
    return true;
  }

  /**
   * Delete object using DeleteObjectCommand.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileKey) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    try {
      await this.client.send(command);
      return true;
    } catch (err) {
      // Fallback for providers requiring presigned query-based auth (e.g. Neon Storage)
      try {
        const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
        await this._sendPresignedRequest(signedUrl, "DELETE");
        return true;
      } catch (_) {
        throw err;
      }
    }
  }

  /**
   * Check existence using HeadObjectCommand.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async exists(fileKey) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    try {
      await this.client.send(command);
      return true;
    } catch (err) {
      if (
        err.name === "NotFound" ||
        err.name === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      try {
        const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
        await this._sendPresignedRequest(signedUrl, "HEAD");
        return true;
      } catch (fallbackErr) {
        if (fallbackErr?.statusCode === 404) return false;
        throw err;
      }
    }
  }

  /**
   * Download a remote object directly to a local file path.
   * @param {string} fileKey
   * @param {string} destPath
   * @returns {Promise<string>}
   */
  async downloadToPath(fileKey, destPath) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    const response = await this.client.send(command);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(response.Body, fs.createWriteStream(destPath));
    return destPath;
  }

  /**
   * Upload a local file directly to remote storage.
   * @param {string} fileKey
   * @param {string} filePath
   * @param {string} [contentType]
   * @returns {Promise<{key: string}>}
   */
  async uploadFile(fileKey, filePath, contentType = "application/octet-stream") {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const stat = fs.statSync(filePath);
    const body = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: body,
      ContentLength: stat.size,
      ContentType: contentType,
    });
    await this.client.send(command);
    return { key: cleanKey };
  }

  /**
   * List object keys matching a prefix.
   * @param {string} [prefix=""]
   * @returns {Promise<Array<{ key: string, lastModified?: Date, size?: number }>>}
   */
  async listObjects(prefix = "") {
    const cleanPrefix = String(prefix || "").replace(/^\//, "");
    let isTruncated = true;
    let continuationToken;
    const items = [];

    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: cleanPrefix,
        ContinuationToken: continuationToken,
      });
      const res = await this.client.send(command);
      const contents = res.Contents || [];
      contents.forEach((entry) => {
        if (entry?.Key) {
          items.push({
            key: entry.Key,
            lastModified: entry.LastModified ? new Date(entry.LastModified) : null,
            size: Number(entry.Size || 0),
          });
        }
      });
      isTruncated = Boolean(res.IsTruncated);
      continuationToken = res.NextContinuationToken;
    }

    return items;
  }

  /**
   * Server-side copy of one object to a new key (same bucket).
   * Falls back to download + re-upload for providers where
   * CopyObject is restricted.
   * @param {string} srcKey
   * @param {string} destKey
   * @returns {Promise<{key: string}>}
   */
  async copyFile(srcKey, destKey) {
    const cleanSrc = String(srcKey || "").replace(/^\//, "");
    const cleanDest = String(destKey || "").replace(/^\//, "");
    if (!cleanSrc || !cleanDest) {
      throw new Error("copyFile requires srcKey and destKey.");
    }
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: `${this.bucket}/${cleanSrc}`,
          Key: cleanDest,
        }),
      );
      return { key: cleanDest };
    } catch (err) {
      // Fallback: download bytes and re-upload (covers providers
      // with restricted CopyObject support).
      const getCommand = new GetObjectCommand({
        Bucket: this.bucket,
        Key: cleanSrc,
      });
      const response = await this.client.send(getCommand);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);
      await this.uploadBuffer(cleanDest, buf, response.ContentType || "application/octet-stream");
      return { key: cleanDest };
    }
  }
}
