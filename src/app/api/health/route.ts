import { neon } from "@neondatabase/serverless";

export async function GET() {
  const checks: { db: "ok" | "error" } = { db: "ok" };
  let status = "ok";

  try {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
    const sql = neon(process.env.DATABASE_URL);
    await sql`SELECT 1`;
  } catch {
    checks.db = "error";
    status = "error";
  }

  return Response.json(
    { status, uptime: process.uptime(), checks },
    { status: status === "ok" ? 200 : 503 }
  );
}
