import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByUsername, createToken } from "@/lib/server-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, password, full_name } = body;

    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return NextResponse.json(
        { detail: "Username must be at least 2 characters." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 3) {
      return NextResponse.json(
        { detail: "Password must be at least 3 characters." },
        { status: 400 }
      );
    }

    if (!full_name || typeof full_name !== "string" || full_name.trim().length < 2) {
      return NextResponse.json(
        { detail: "Full name must be at least 2 characters." },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim();
    const existing = getUserByUsername(cleanUsername);
    if (existing) {
      return NextResponse.json(
        { detail: "Username already taken. Please choose another." },
        { status: 400 }
      );
    }

    const user = createUser(cleanUsername, password, full_name);

    const token = createToken({
      sub: user.username,
      user_id: user.id,
      role: "doctor",
      full_name: user.fullName,
    });

    return NextResponse.json(
      {
        message: "Doctor registered successfully",
        access_token: token,
        token_type: "bearer",
        role: "doctor",
        full_name: user.fullName,
        username: user.username,
        user_id: user.id,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.fullName,
          role: "doctor",
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Failed to register user." },
      { status: 500 }
    );
  }
}
