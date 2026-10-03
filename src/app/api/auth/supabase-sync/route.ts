import { NextRequest, NextResponse } from "next/server";
import { findOrCreateGoogleUser, createToken } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, fullName } = body;

    if (!email) {
      return NextResponse.json(
        { detail: "Email is required to sync doctor account." },
        { status: 400 }
      );
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(fullName || cleanEmail.split("@")[0]).trim();

    const user = findOrCreateGoogleUser(cleanEmail, cleanName);

    const token = createToken({
      sub: user.username,
      user_id: user.id,
      role: "doctor",
      full_name: user.fullName,
    });

    return NextResponse.json({
      access_token: token,
      token_type: "bearer",
      role: "doctor",
      full_name: user.fullName,
      username: user.username,
      user_id: user.id,
    });
  } catch (err: any) {
    console.error("Supabase sync error:", err);
    return NextResponse.json(
      { detail: err.message || "Failed to sync Supabase user session." },
      { status: 500 }
    );
  }
}
