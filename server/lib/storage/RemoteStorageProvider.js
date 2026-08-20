import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
      this.client = new S3Client(clientConfig);
    }
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
   * Upload raw buffer or stream directly to S3/R2.
   * @param {string} fileKey
   * @param {Buffer|Uint8Array|string} body
   * @param {string} [contentType]
   * @returns {Promise<{key: string}>}
   */
  async uploadBuffer(fileKey, body, contentType = "application/octet-stream") {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
    return { key: cleanKey };
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
   * Delete object using DeleteObjectCommand.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileKey) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });
    await this.client.send(command);
    return true;
  }

  /**
   * Check existence using HeadObjectCommand.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async exists(fileKey) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });
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
      throw err;
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
    const bodyStream = response.Body;

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    const writeStream = fs.createWriteStream(destPath);

    await new Promise((resolve, reject) => {
      bodyStream.pipe(writeStream);
      bodyStream.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
    });

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
    const body = fs.createReadStream(filePath);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
    return { key: cleanKey };
  }
}
