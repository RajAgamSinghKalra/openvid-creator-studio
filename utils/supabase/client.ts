import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is unavailable. Use local-only mode or configure Supabase environment variables.");
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
};
