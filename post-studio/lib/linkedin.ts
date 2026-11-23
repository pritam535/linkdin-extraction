// Used by both the Next.js server and the queue worker (plain Node), so no "server-only" import.
import { readFile } from "node:fs/promises";
import { NO_POST_PERMISSION, linkedinCredentials } from "./connection";

const API = "https://api.linkedin.com/rest";

/** Live posting is off unless POST_STUDIO_LIVE=1. Everything else is a dry run. */
export const isLive = () => process.env.POST_STUDIO_LIVE === "1";

type Auth = { token: string; member: string; version: string };

async function auth(): Promise<Auth> {
  const version = process.env.LI_VERSION;
  if (!version) throw new Error("Set LI_VERSION to a current LinkedIn API version (YYYYMM).");
  return { ...(await linkedinCredentials()), version };
}

const headers = (a: Auth) => ({
  Authorization: `Bearer ${a.token}`,
  "LinkedIn-Version": a.version,
  "X-Restli-Protocol-Version": "2.0.0",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload an image via LinkedIn's Images API and return its urn:li:image.
 * Flow: initializeUpload -> PUT bytes to uploadUrl -> wait until AVAILABLE.
 * Verify against LinkedIn's current Images API docs before relying on it.
 */
async function uploadImage(a: Auth, filePath: string, contentType: string): Promise<string> {
  const init = await fetch(`${API}/images?action=initializeUpload`, {
    method: "POST",
    headers: { ...headers(a), "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${a.member}` } }),
  });
  if (!init.ok) throw new Error(`Image init failed ${init.status}: ${await init.text()}`);
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };

  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": contentType },
    body: await readFile(filePath),
  });
  if (!put.ok) throw new Error(`Image upload failed ${put.status}: ${await put.text()}`);

  // LinkedIn processes the image asynchronously. Poll briefly; post anyway if status is unreadable.
  for (let i = 0; i < 10; i++) {
    const s = await fetch(`${API}/images/${encodeURIComponent(value.image)}`, { headers: headers(a) });
    if (!s.ok) break;
    const { status } = (await s.json()) as { status?: string };
    if (status === "AVAILABLE") break;
    if (status === "PROCESSING_FAILED") throw new Error("LinkedIn could not process the image.");
    await sleep(2000);
  }
  return value.image;
}

export type PostImage = { path: string; contentType: string; altText: string };

/** Publish via LinkedIn's official Posts API, optionally with one image. */
export async function publishPost(text: string, image?: PostImage): Promise<{ id: string | null }> {
  const a = await auth();
  const imageUrn = image ? await uploadImage(a, image.path, image.contentType) : null;

  const res = await fetch(`${API}/posts`, {
    method: "POST",
    headers: { ...headers(a), "Content-Type": "application/json" },
    body: JSON.stringify({
      author: `urn:li:person:${a.member}`,
      commentary: text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(imageUrn ? { content: { media: { id: imageUrn, altText: image!.altText } } } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && /ACCESS_DENIED|permissions/i.test(body)) throw new Error(NO_POST_PERMISSION);
    if (res.status === 401) throw new Error("LinkedIn rejected the sign-in token. In Settings, click Reconnect.");
    throw new Error(`LinkedIn returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return { id: res.headers.get("x-restli-id") };
}
