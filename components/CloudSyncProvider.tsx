"use client";

import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useStudyStore } from "@/store/useStudyStore";

type SyncStatus =
  | "disabled"
  | "loading"
  | "signed_out"
  | "syncing"
  | "synced"
  | "error";

interface CloudSyncContextValue {
  configured: boolean;
  status: SyncStatus;
  email: string | null;
  error: string | null;
  signOut: () => Promise<void>;
  retry: () => void;
}

const CloudSyncContext = createContext<CloudSyncContextValue>({
  configured: isSupabaseConfigured,
  status: isSupabaseConfigured ? "loading" : "disabled",
  email: null,
  error: null,
  signOut: async () => {},
  retry: () => {},
});

type PersistedStudyData = Pick<
  ReturnType<typeof useStudyStore.getState>,
  "subjects" | "playlists" | "lectures" | "events" | "sessions" | "threads" | "settings"
>;

function withoutApiKeys(
  data: PersistedStudyData
): PersistedStudyData {
  return {
    ...data,
    settings: {
      ...data.settings,
      geminiKey: "",
      groqKey: "",
      youtubeKey: "",
    },
  };
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage("Account created. Check your email to verify it, then sign in.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-7 rounded-2xl glass-panel bg-white/[0.03] border border-white/10 space-y-5"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#00f0ff] font-semibold">
            Cloud sync
          </p>
          <h1 className="text-2xl font-black text-white mt-2">
            {isSignUp ? "Create your account" : "Sign in to Study Tracker"}
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Your study data syncs privately across devices with your account.
          </p>
        </div>

        <label className="block text-xs text-gray-300 space-y-1.5">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:border-[#00f0ff]"
          />
        </label>

        <label className="block text-xs text-gray-300 space-y-1.5">
          <span>Password (at least 6 characters)</span>
          <input
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white focus:outline-none focus:border-[#00f0ff]"
          />
        </label>

        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#a855f7] text-black font-bold text-sm disabled:opacity-60"
        >
          {busy ? "Please wait..." : isSignUp ? "Create account" : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => {
            setIsSignUp((current) => !current);
            setMessage(null);
            setError(null);
          }}
          className="w-full text-xs text-gray-400 hover:text-white"
        >
          {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>(
    isSupabaseConfigured ? "loading" : "disabled"
  );
  const [error, setError] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(!isSupabaseConfigured);
  const activeUserIdRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadUserData = useCallback(async (currentUser: User) => {
    if (!supabase) return;
    const requestId = ++loadRequestRef.current;
    activeUserIdRef.current = currentUser.id;
    setUser(currentUser);
    setDataReady(false);
    setStatus("loading");
    setError(null);

    try {
      if (!useStudyStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          let unsubscribe = () => {};
          unsubscribe = useStudyStore.persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
          });
        });
      }
      if (requestId !== loadRequestRef.current) return;

      const { data: cloudRecord, error: readError } = await supabase
        .from("user_data")
        .select("payload")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      if (readError) throw readError;
      if (requestId !== loadRequestRef.current) return;

      if (cloudRecord) {
        const localSettings = useStudyStore.getState().settings;
        const cloudPayload = cloudRecord.payload as Partial<PersistedStudyData>;
        useStudyStore.getState().importAllData({
          ...cloudPayload,
          settings: {
            ...localSettings,
            ...cloudPayload.settings,
            geminiKey: localSettings.geminiKey,
            groqKey: localSettings.groqKey,
            youtubeKey: localSettings.youtubeKey,
          },
        });
      } else {
        const initialPayload = withoutApiKeys(useStudyStore.getState());
        const { error: writeError } = await supabase.from("user_data").upsert(
          {
            user_id: currentUser.id,
            payload: initialPayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (writeError) throw writeError;
      }

      if (requestId === loadRequestRef.current) {
        setDataReady(true);
        setStatus("synced");
      }
    } catch (syncError) {
      if (requestId === loadRequestRef.current) {
        setError(syncError instanceof Error ? syncError.message : "Cloud sync failed.");
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        if (activeUserIdRef.current !== session.user.id) {
          void loadUserData(session.user);
        }
      } else {
        loadRequestRef.current += 1;
        activeUserIdRef.current = null;
        setUser(null);
        setDataReady(false);
        setStatus("signed_out");
        setError(null);
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) return;
      if (sessionError) {
        setError(sessionError.message);
        setStatus("error");
      } else if (data.session?.user) {
        void loadUserData(data.session.user);
      } else {
        setStatus("signed_out");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadUserData]);

  useEffect(() => {
    const client = supabase;
    if (!client || !user || !dataReady) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let pendingPayload: PersistedStudyData | null = null;
    let saving = false;
    let disposed = false;

    const flush = async () => {
      if (saving || disposed || !pendingPayload) return;
      saving = true;
      setStatus("syncing");

      try {
        while (!disposed && pendingPayload) {
          const payload = pendingPayload;
          pendingPayload = null;
          const { error: writeError } = await client.from("user_data").upsert(
            {
              user_id: user.id,
              payload,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
          if (writeError) throw writeError;
        }
        if (!disposed) {
          setError(null);
          setStatus("synced");
        }
      } catch (syncError) {
        if (!disposed) {
          setError(syncError instanceof Error ? syncError.message : "Cloud sync failed.");
          setStatus("error");
        }
      } finally {
        saving = false;
        if (!disposed && pendingPayload) void flush();
      }
    };

    const unsubscribe = useStudyStore.subscribe((state) => {
      pendingPayload = withoutApiKeys(state);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 700);
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [dataReady, user]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const retry = useCallback(() => {
    if (user) void loadUserData(user);
  }, [loadUserData, user]);

  const contextValue: CloudSyncContextValue = {
    configured: isSupabaseConfigured,
    status,
    email: user?.email || null,
    error,
    signOut,
    retry,
  };

  if (isSupabaseConfigured && !user) {
    return (
      <CloudSyncContext.Provider value={contextValue}>
        <SignInScreen />
      </CloudSyncContext.Provider>
    );
  }

  if (isSupabaseConfigured && !dataReady) {
    return (
      <CloudSyncContext.Provider value={contextValue}>
        <main className="min-h-screen flex items-center justify-center p-5">
          <div className="w-full max-w-lg p-7 rounded-2xl glass-panel bg-white/[0.03] border border-white/10 space-y-4">
            <h1 className="text-xl font-bold text-white">
              {status === "error" ? "Could not load cloud data" : "Loading cloud data..."}
            </h1>
            {error ? (
              <p className="text-sm text-red-300">{error}</p>
            ) : (
              <p className="text-sm text-gray-400">Please wait while your data syncs.</p>
            )}
            {status === "error" && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={retry}
                  className="px-4 py-2 rounded-xl bg-[#00f0ff] text-black text-sm font-semibold"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-semibold"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </main>
      </CloudSyncContext.Provider>
    );
  }

  return (
    <CloudSyncContext.Provider value={contextValue}>
      {children}
    </CloudSyncContext.Provider>
  );
}

export function useCloudSync() {
  return useContext(CloudSyncContext);
}
