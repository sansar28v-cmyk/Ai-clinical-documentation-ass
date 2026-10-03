import { NextRequest, NextResponse } from "next/server";
import { findOrCreateGoogleUser, createToken } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { credential } = body;

    if (!credential) {
      return NextResponse.json(
        { detail: "Google credential is required." },
        { status: 400 }
      );
    }

    // Verify Google ID token via Google's tokeninfo API
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { cache: "no-store" }
    );

    if (!googleRes.ok) {
      const errText = await googleRes.text().catch(() => "");
      console.error("Google token verification failed:", googleRes.status, errText);
      return NextResponse.json(
        { detail: "Invalid or expired Google authentication credential." },
        { status: 401 }
      );
    }

    const payload = (await googleRes.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      given_name?: string;
      picture?: string;
      sub?: string;
    };

    const expectedClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "634580477902-jedoe240vgl2mfetrs3rivq1uvppkn8u.apps.googleusercontent.com";

    if (expectedClientId && payload.aud && payload.aud !== expectedClientId) {
      console.warn("Audience mismatch:", payload.aud, "expected:", expectedClientId);
      return NextResponse.json(
        { detail: "Google client ID mismatch." },
        { status: 403 }
      );
    }

    const email = payload.email;
    if (!email) {
      return NextResponse.json(
        { detail: "No email address returned from Google profile." },
        { status: 400 }
      );
    }

    const fullName = payload.name || payload.given_name || email.split("@")[0];
    const user = findOrCreateGoogleUser(email, fullName);

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
      picture: payload.picture || null,
    });
  } catch (err: any) {
    console.error("Google auth route error:", err);
    return NextResponse.json(
      { detail: err.message || "Failed to authenticate with Google." },
      { status: 500 }
    );
  }
}
