import { createClient as createServerSupabaseClient } from "./supabase/server";

export async function fetchApiServer(endpoint: string, options: RequestInit = {}) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.statusText}`);
  }
  
  return res.json();
}
