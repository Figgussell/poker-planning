import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

const cookieName = "table_plan_local_session";
const secretPath = path.join(process.cwd(), "data", "local-demo.secret");
let secretPromise: Promise<Buffer> | undefined;

async function getSecret() {
  secretPromise ??= (async () => {
    await mkdir(path.dirname(secretPath), { recursive: true });
    try {
      return await readFile(secretPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const secret = createHmac("sha256", randomUUID()).update(randomUUID()).digest();
      try {
        await writeFile(secretPath, secret, { flag: "wx" });
        return secret;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
        return readFile(secretPath);
      }
    }
  })();
  return secretPromise;
}

function sign(userId: string, secret: Buffer) {
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export async function getLocalUserId() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const [userId, signature] = value.split(".");
  if (!userId || !signature) return null;
  const expected = Buffer.from(sign(userId, await getSecret()), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return userId;
}

export async function createLocalSession() {
  const userId = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(cookieName, `${userId}.${sign(userId, await getSecret())}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return userId;
}