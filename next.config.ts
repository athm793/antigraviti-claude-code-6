import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers scoped to the dashboard only.
 *
 * /api/proxy and /api/run must not receive these: the proxy forwards upstream
 * responses verbatim, and stamping a CSP or X-Frame-Options onto someone
 * else's API response would change what their client receives.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    // 'unsafe-inline' on styles is required by Tailwind's runtime style
    // injection; scripts stay locked to same-origin. connect-src is 'self'
    // only — the dashboard never calls a third party from the browser, all
    // upstream traffic goes out server-side.
    //
    // 'unsafe-eval' is development-only: React's dev build uses eval to
    // reconstruct call stacks across environments, and without it the dev
    // overlay breaks. React never evals in production, so the production
    // policy stays strict.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Everything except the pass-through API surfaces.
        source: "/((?!api/proxy|api/debug|api/run).*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
