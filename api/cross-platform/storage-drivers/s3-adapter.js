/* eslint-env node */
/**
 * S3-Compatible Storage Adapter
 * 
 * Supports AWS S3, Cloudflare R2, and other S3-compatible services.
 * Uses AWS SDK v3 for S3 operations.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Create S3 storage driver
 * 
 * @param {Object} config - S3 configuration
 * @param {string} config.endpoint - S3 endpoint URL (optional for AWS, required for R2/others)
 * @param {string} config.region - AWS region or 'auto' for R2
 * @param {string} config.bucket - Bucket name
 * @param {string} config.accessKeyId - Access key ID
 * @param {string} config.secretAccessKey - Secret access key
 * @returns {Object} Storage driver with upload and delete methods
 */
export function createS3Driver(config) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = config;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3 driver requires bucket, accessKeyId, and secretAccessKey');
  }

  // Configure S3 client
  const clientConfig = {
    region: region || 'auto',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };

  // Add endpoint for R2 or other S3-compatible services
  if (endpoint) {
    clientConfig.endpoint = endpoint;
  }

  const s3Client = new S3Client(clientConfig);

  return {
    /**
     * Upload file to S3-compatible storage
     * 
     * @param {string} path - File path within bucket
     * @param {Buffer} buffer - File data
     * @param {string} contentType - MIME type
     * @returns {Promise<Object>} Upload result with url
     */
    async upload(path, buffer, contentType) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: buffer,
        ContentType: contentType || 'application/octet-stream',
      });

      await s3Client.send(command);

      // Construct URL based on endpoint
      let url;
      if (endpoint) {
        // For R2 or custom endpoints
        const baseUrl = endpoint.replace(/\/$/, '');
        url = `${baseUrl}/${bucket}/${path}`;
      } else {
        // For standard AWS S3
        url = `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
      }

      return { url };
    },

    /**
     * Delete file from S3-compatible storage
     * 
     * @param {string} path - File path within bucket
     * @returns {Promise<void>}
     */
    async delete(path) {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: path,
      });

      await s3Client.send(command);
    },

    /**
     * Get driver type
     */
    getType() {
      return 's3';
    },
  };
}
