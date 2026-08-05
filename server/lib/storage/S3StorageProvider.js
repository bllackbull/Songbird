import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageProvider } from "./StorageProvider.js";

export class S3StorageProvider extends StorageProvider {
  constructor(config = {}) {
    super();
    this.bucket = config.bucket || config.STORAGE_S3_BUCKET;
    this.region = config.region || config.STORAGE_S3_REGION || "us-east-1";
    this.endpoint = config.endpoint || config.STORAGE_S3_ENDPOINT;
    this.publicUrl = config.publicUrl || config.STORAGE_S3_PUBLIC_URL;
    this.expiresIn = Number(
      config.expiresIn || config.STORAGE_S3_EXPIRES_IN || 3600,
    );

    const accessKeyId =
      config.accessKeyId ||
      config.STORAGE_S3_ACCESS_KEY_ID ||
      config.credentials?.accessKeyId;
    const secretAccessKey =
      config.secretAccessKey ||
      config.STORAGE_S3_SECRET_ACCESS_KEY ||
      config.credentials?.secretAccessKey;

    const forcePathStyle =
      config.forcePathStyle !== undefined
        ? Boolean(config.forcePathStyle)
        : config.STORAGE_S3_FORCE_PATH_STYLE !== undefined
          ? String(config.STORAGE_S3_FORCE_PATH_STYLE) === "true"
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
      type: "s3",
      uploadUrl,
    };
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
}
