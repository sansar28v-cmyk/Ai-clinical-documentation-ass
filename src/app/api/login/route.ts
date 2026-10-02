import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, verifyPassword, createToken } from "@/lib/server-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { detail: "Username and password are required." },
        { status: 400 }
      );
    }

    const cleanUsername = String(username).trim();
    const user = getUserByUsername(cleanUsername);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { detail: "Invalid username or password" },
        { status: 401 }
      );
    }

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
    return NextResponse.json(
      { detail: err.message || "Login failed." },
      { status: 500 }
    );
  }
}
