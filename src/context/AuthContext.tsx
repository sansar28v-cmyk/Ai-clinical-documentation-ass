"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest, User } from "@/lib/api";
import { supabase } from "@/lib/supabase-client";

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  role: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  loginWithSupabaseGoogle: () => Promise<void>;
  signup: (username: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Store token and user strictly in React state/memory - NOT in localStorage per instructions
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync Supabase user with backend store
  const syncSupabaseUser = async (sbUser: any) => {
    try {
      const email = sbUser.email;
      if (!email) return;

      const fullName =
        sbUser.user_metadata?.full_name ||
        sbUser.user_metadata?.name ||
        email.split("@")[0] ||
        "Doctor";

      const data = await apiRequest<{
        access_token: string;
        token_type: string;
        role?: string;
        full_name: string;
        username: string;
        user_id: number;
      }>("/api/auth/supabase-sync", {
        method: "POST",
        body: { email, fullName },
      });

      const loggedUser: User = {
        id: data.user_id,
        username: data.username,
        full_name: data.full_name,
        role: "doctor",
      };

      setToken(data.access_token);
      setUser(loggedUser);
    } catch (e) {
      console.warn("Error syncing Supabase user with session:", e);
    }
  };

  // Check active Supabase session or listen to OAuth redirect
  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isMounted) {
          await syncSupabaseUser(session.user);
        }
      } catch (err) {
        console.warn("Supabase session check error:", err);
      }
    }

    checkExistingSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && isMounted) {
        await syncSupabaseUser(session.user);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loginWithSupabaseGoogle = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // Robust origin detection for Vercel production & preview deployments
      let redirectOrigin = "";
      if (typeof window !== "undefined" && window.location.origin) {
        redirectOrigin = window.location.origin;
      } else if (process.env.NEXT_PUBLIC_SITE_URL) {
        redirectOrigin = process.env.NEXT_PUBLIC_SITE_URL;
      } else if (process.env.NEXT_PUBLIC_VERCEL_URL) {
        redirectOrigin = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
      }

      const redirectTo = redirectOrigin
        ? `${redirectOrigin.replace(/\/+$/, "")}/`
        : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      const msg = err.message || "Failed to start Google sign-in with Supabase";
      setError(msg);
      setLoading(false);
      throw err;
    }
  };

  const loginWithGoogle = async (credential: string): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        access_token: string;
        token_type: string;
        role?: string;
        full_name: string;
        username: string;
        user_id: number;
        picture?: string;
      }>("/api/auth/google", {
        method: "POST",
        body: { credential },
      });

      const loggedUser: User = {
        id: data.user_id,
        username: data.username,
        full_name: data.full_name,
        role: "doctor",
      };

      setToken(data.access_token);
      setUser(loggedUser);
      return loggedUser;
    } catch (err: any) {
      const msg = err.message || "Google authentication failed";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<User> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        access_token: string;
        token_type: string;
        role?: string;
        full_name: string;
        username: string;
        user_id: number;
      }>("/login", {
        method: "POST",
        body: { username, password },
      });

      const loggedUser: User = {
        id: data.user_id,
        username: data.username,
        full_name: data.full_name,
        role: "doctor",
      };

      setToken(data.access_token);
      setUser(loggedUser);
      return loggedUser;
    } catch (err: any) {
      const msg = err.message || "Invalid username or password";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (
    username: string,
    password: string,
    fullName: string
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        access_token?: string;
        token_type?: string;
        user?: {
          id: number;
          username: string;
          full_name: string;
          role: string;
        };
      }>("/signup", {
        method: "POST",
        body: {
          username,
          password,
          full_name: fullName,
        },
      });

      if (data.access_token && data.user) {
        const loggedUser: User = {
          id: data.user.id,
          username: data.user.username,
          full_name: data.user.full_name,
          role: "doctor",
        };
        setToken(data.access_token);
        setUser(loggedUser);
      }
    } catch (err: any) {
      const msg = err.message || "Signup failed. Please try again.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
    supabase.auth.signOut().catch(() => {});
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token && !!user,
        role: user ? user.role || "doctor" : null,
        loading,
        error,
        login,
        loginWithGoogle,
        loginWithSupabaseGoogle,
        signup,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
