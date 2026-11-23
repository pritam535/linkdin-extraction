// Stores the LinkedIn connection made through "Connect LinkedIn" (OAuth).
// Shared by the Next.js server and the queue worker, so no "server-only" import.
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const FILE = path.join(process.cwd(), "data", "linkedin.json"); // gitignored, chmod 600

export type Connection = {
  token: string;
  member: string; // the OpenID "sub", used as urn:li:person:<member>
  name: string;
  picture: string | null;
  expiresAt: string; // ISO
  connectedAt: string;
  scope?: string; // what LinkedIn actually granted, e.g. "openid,profile,w_member_social"
};

export const POST_SCOPE = "w_member_social";
/** null = unknown (older connection, scope wasn't recorded). */
export const canPost = (c: Connection | null) => (c?.scope ? c.scope.split(/[ ,]+/).includes(POST_SCOPE) : null);

export const NO_POST_PERMISSION =
  "LinkedIn didn't give Post Studio permission to post (w_member_social). In Settings, click Reconnect and approve posting. The app needs the 'Share on LinkedIn' product.";

export async function saveConnection(c: Connection) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(c, null, 2), { encoding: "utf8", mode: 0o600 });
  await chmod(FILE, 0o600);
}

export async function loadConnection(): Promise<Connection | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Connection;
  } catch {
    return null;
  }
}

export async function clearConnection() {
  await unlink(FILE).catch(() => {});
}

async function keychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await run("security", ["find-generic-password", "-s", service, "-w"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Token + member id: from "Connect LinkedIn" first, else from the Keychain (li-publish setup). */
export async function linkedinCredentials(): Promise<{ token: string; member: string }> {
  const c = await loadConnection();
  if (c) {
    if (new Date(c.expiresAt) <= new Date())
      throw new Error("LinkedIn connection expired. Click Connect LinkedIn again.");
    if (canPost(c) === false) throw new Error(NO_POST_PERMISSION);
    return { token: c.token, member: c.member };
  }
  const [token, member] = await Promise.all([keychain("linkedin-token"), keychain("linkedin-member-id")]);
  if (!token || !member) throw new Error("LinkedIn isn't connected. Click Connect LinkedIn in Post Studio.");
  return { token, member };
}

/** OAuth app settings: env first, else Keychain entries linkedin-client-id / linkedin-client-secret. */
export async function oauthApp() {
  const clientId = process.env.LINKEDIN_CLIENT_ID || (await keychain("linkedin-client-id"));
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || (await keychain("linkedin-client-secret"));
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3009/api/linkedin/callback";
  return { clientId, clientSecret, redirectUri };
}
