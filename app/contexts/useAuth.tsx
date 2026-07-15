"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { isLocalOnlyBrowser, LOCAL_ONLY_DEFAULT } from "@/lib/local-mode";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  provider: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  localMode: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // This initial value is identical during SSR and the first client render.
  // Hostname-based localhost detection happens after hydration so React/Radix
  // see exactly the same component tree and generate matching IDs.
  const [localMode, setLocalMode] = useState(LOCAL_ONLY_DEFAULT);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!LOCAL_ONLY_DEFAULT);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = supabaseRef.current;
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const browserLocalMode = isLocalOnlyBrowser();
    let mounted = true;

    if (browserLocalMode) {
      // In production, localhost is only knowable in the browser. Defer the
      // transition until after the hydration commit has completed.
      if (!LOCAL_ONLY_DEFAULT) {
        queueMicrotask(() => {
          if (!mounted) return;
          setLocalMode(true);
          setLoading(false);
        });
      }
      return () => {
        mounted = false;
      };
    }

    let supabase: SupabaseClient;

    try {
      supabase = createClient();
      supabaseRef.current = supabase;
    } catch (error) {
      console.error("Error initializing auth:", error);
      queueMicrotask(() => {
        if (mounted) setLoading(false);
      });
      return () => {
        mounted = false;
      };
    }

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setLoading(false);

        if (initialSession?.user) {
          const profileData = await fetchProfile(initialSession.user.id);
          if (mounted) setProfile(profileData);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (mounted) setLoading(false);
      }
    };

    void initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const profileData = await fetchProfile(newSession.user.id);
        if (mounted) setProfile(profileData);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      supabaseRef.current = null;
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const profileData = await fetchProfile(user.id);
    setProfile(profileData);
  }, [fetchProfile, user]);

  const signOut = useCallback(async () => {
    await supabaseRef.current?.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, localMode, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
