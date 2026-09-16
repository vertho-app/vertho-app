import { currentPerson } from './runtime';
const user = () => ({ id: currentPerson().key, email: currentPerson().key });
// A local presentation identity, never an authentication token or a Supabase client.
const client = { auth: {
  getUser: async () => ({ data: { user: user() }, error: null }),
  getSession: async () => ({ data: { session: { user: user() } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
} };
export function getSupabase() { return client; }
