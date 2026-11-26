import { signWebviewToken } from "@/lib/auth";
import { json, withAuth } from "@/lib/api";

/**
 * POST /api/mobile/webview-token → { token, exchangeUrl }
 * The app opens exchangeUrl in a web view; the server turns the 10-minute token
 * into the normal session cookie and redirects to the embedded book viewer.
 */
export const POST = withAuth(["STUDENT", "TEACHER", "PARENT"], async (_req, session) => {
  const token = await signWebviewToken(session);
  return json({ token, exchangePath: "/api/auth/webview", expiresInSeconds: 600 });
});
