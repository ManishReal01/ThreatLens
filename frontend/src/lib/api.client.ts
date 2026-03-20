import { createClient as createBrowserClient } from "./supabase/client";

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  
  const res = await fetch(endpoint, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    throw new Error(`API Error: ${res.statusText}`);
  }
  
  return res.json();
}
