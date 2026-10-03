"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { apiRequest, User } from "@/lib/api";

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  role: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User>;
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
