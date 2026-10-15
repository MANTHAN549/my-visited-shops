import type { AuthChangeEvent, User } from '@supabase/supabase-js'
import type { CloudKeyring } from './cloudEncryptionService'
import { supabase } from './supabaseClient'

function client() {
  if (!supabase) throw new Error('Cloud sync is not configured. Check the Supabase URL and publishable key in .env.local.')
  return supabase
}

function authError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/already registered/i.test(message)) return 'An account with this email already exists. Try signing in.'
  if (/password should be at least/i.test(message)) return 'Use a longer password for your account.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email using the link we sent, then sign in.'
  return message
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await client().auth.getSession()
  if (error) throw new Error(authError(error.message))
  return data.session?.user ?? null
}

export async function signUp(email: string, password: string) {
  const { data, error } = await client().auth.signUp({ email: email.trim(), password })
  if (error) throw new Error(authError(error.message))
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(authError(error.message))
  return data
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut()
  if (error) throw new Error(authError(error.message))
}

export async function sendPasswordReset(email: string): Promise<void> {
  const returnTo = `${window.location.origin}${window.location.pathname}#/settings`
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: returnTo })
  if (error) throw new Error(authError(error.message))
}

export async function updateAccountPassword(password: string): Promise<void> {
  const { error } = await client().auth.updateUser({ password })
  if (error) throw new Error(authError(error.message))
}

export async function getCloudKeyring(userId: string): Promise<CloudKeyring | null> {
  const { data, error } = await client().from('user_keyrings').select('keyring').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`Could not read encryption setup: ${error.message}`)
  return (data?.keyring as CloudKeyring | undefined) ?? null
}

export async function insertCloudKeyring(userId: string, keyring: CloudKeyring): Promise<void> {
  const { error } = await client().from('user_keyrings')
    .insert({ user_id: userId, keyring, updated_at: new Date().toISOString() })
  if (error) throw new Error(`Could not create encryption setup: ${error.message}`)
}

export async function saveCloudKeyring(userId: string, keyring: CloudKeyring): Promise<void> {
  const { data, error } = await client().from('user_keyrings')
    .update({ keyring, updated_at: new Date().toISOString() })
    .eq('user_id', userId).select('user_id').maybeSingle()
  if (error) throw new Error(`Could not save encryption setup: ${error.message}`)
  if (!data) throw new Error('The account encryption setup no longer exists. Reload it before changing the passphrase.')
}

export function listenForAuth(callback: (user: User | null, event: AuthChangeEvent) => void): () => void {
  const { data } = client().auth.onAuthStateChange((event, session) => callback(session?.user ?? null, event))
  return () => data.subscription.unsubscribe()
}
