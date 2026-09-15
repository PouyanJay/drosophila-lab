import 'server-only';
// Single-user local workspace. proxy.ts rejects non-local and cross-origin requests.
// Hosted identity headers are never used.
export type LocalUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
export async function getLocalUser(): Promise<LocalUser | null> {
  if (process.env.LOCAL_WORKSPACE !== '1') return null;
  return { userId: 'local-workspace', displayName: 'Local researcher', email: '', fullName: null };
}
export async function requireLocalUser() {
  const user = await getLocalUser();
  if (!user) throw Error('Start the local workspace.');
  return user;
}
