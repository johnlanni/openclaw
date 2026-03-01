import type { MatrixClient } from "@vector-im/matrix-bot-sdk";
import { getMatrixRuntime } from "../../runtime.js";

// Type for encrypted file info
type EncryptedFile = {
  url: string;
  key: {
    kty: string;
    key_ops: string[];
    alg: string;
    k: string;
    ext: boolean;
  };
  iv: string;
  hashes: Record<string, string>;
  v: string;
};

/**
 * Parse an mxc:// URL into server name and media ID
 * mxc://server.name:port/mediaId -> { serverName: "server.name:port", mediaId: "mediaId" }
 */
function parseMxcUrl(mxcUrl: string): { serverName: string; mediaId: string } | null {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  return { serverName: match[1], mediaId: match[2] };
}

async function fetchMatrixMediaBuffer(params: {
  client: MatrixClient;
  mxcUrl: string;
  maxBytes: number;
}): Promise<{ buffer: Buffer; headerType?: string } | null> {
  const parsed = parseMxcUrl(params.mxcUrl);
  if (!parsed) {
    throw new Error(`Invalid mxc:// URL: ${params.mxcUrl}`);
  }

  // Get the homeserver URL from the client (mxcToHttp returns a full HTTP URL)
  const httpUrl = await params.client.mxcToHttp(params.mxcUrl);
  if (!httpUrl) {
    return null;
  }

  // Extract base URL from the HTTP URL
  const urlObj = new URL(httpUrl);
  const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

  // Try the authenticated media endpoint first (MSC3916)
  // This is required when homeserver has unauthenticated media disabled
  const authMediaUrl = `${baseUrl}/_matrix/client/v1/media/download/${parsed.serverName}/${parsed.mediaId}`;

  // Get access token from config since MatrixClient doesn't expose it directly
  const cfg = getMatrixRuntime().config.loadConfig();
  const matrixCfg = cfg.channels?.matrix;
  const accessToken = matrixCfg?.accessToken;

  if (accessToken) {
    try {
      const response = await fetch(authMediaUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.byteLength > params.maxBytes) {
          throw new Error("Matrix media exceeds configured size limit");
        }

        const contentType = response.headers.get("content-type") ?? undefined;
        return { buffer, headerType: contentType };
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fall back to the client's downloadContent method (uses unauthenticated endpoint)
  try {
    const buffer = await params.client.downloadContent(params.mxcUrl);
    if (buffer.byteLength > params.maxBytes) {
      throw new Error("Matrix media exceeds configured size limit");
    }
    return { buffer: Buffer.from(buffer) };
  } catch (err) {
    throw new Error(`Matrix media download failed: ${String(err)}`, { cause: err });
  }
}

/**
 * Download and decrypt encrypted media from a Matrix room.
 * Uses @vector-im/matrix-bot-sdk's decryptMedia which handles both download and decryption.
 */
async function fetchEncryptedMediaBuffer(params: {
  client: MatrixClient;
  file: EncryptedFile;
  maxBytes: number;
}): Promise<{ buffer: Buffer } | null> {
  if (!params.client.crypto) {
    throw new Error("Cannot decrypt media: crypto not enabled");
  }

  // decryptMedia handles downloading and decrypting the encrypted content internally
  const decrypted = await params.client.crypto.decryptMedia(params.file);

  if (decrypted.byteLength > params.maxBytes) {
    throw new Error("Matrix media exceeds configured size limit");
  }

  return { buffer: decrypted };
}

export async function downloadMatrixMedia(params: {
  client: MatrixClient;
  mxcUrl: string;
  contentType?: string;
  sizeBytes?: number;
  maxBytes: number;
  file?: EncryptedFile;
}): Promise<{
  path: string;
  contentType?: string;
  placeholder: string;
} | null> {
  let fetched: { buffer: Buffer; headerType?: string } | null;
  if (typeof params.sizeBytes === "number" && params.sizeBytes > params.maxBytes) {
    throw new Error("Matrix media exceeds configured size limit");
  }

  if (params.file) {
    // Encrypted media
    fetched = await fetchEncryptedMediaBuffer({
      client: params.client,
      file: params.file,
      maxBytes: params.maxBytes,
    });
  } else {
    // Unencrypted media
    fetched = await fetchMatrixMediaBuffer({
      client: params.client,
      mxcUrl: params.mxcUrl,
      maxBytes: params.maxBytes,
    });
  }

  if (!fetched) {
    return null;
  }
  const headerType = fetched.headerType ?? params.contentType ?? undefined;
  const saved = await getMatrixRuntime().channel.media.saveMediaBuffer(
    fetched.buffer,
    headerType,
    "inbound",
    params.maxBytes,
  );
  return {
    path: saved.path,
    contentType: saved.contentType,
    placeholder: "[matrix media]",
  };
}
