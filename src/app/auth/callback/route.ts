import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-client";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    try {
      await supabase.auth.exchangeCodeForSession(code);
    } catch (err) {
      console.warn("Failed to exchange code for session in callback:", err);
    }
  }

  // Redirect back to root or destination page on the current origin
  return NextResponse.redirect(`${origin}${next}`);
}
