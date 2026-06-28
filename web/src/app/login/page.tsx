import { getAuthConfigStatus } from '@/lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; redirectTo?: string }> }) {
  const searchParams = await props.searchParams;
  const status = getAuthConfigStatus();
  const canLogin = status.hasAdminPassword && status.hasSessionSecret;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4">
      <div className="rounded-md border p-6">
        <h1 className="text-xl font-semibold">Admin login</h1>
        <p className="mt-2 text-sm text-fd-muted-foreground">Repository management, comments, and writeback require an admin session.</p>
        {!canLogin ? (
          <div className="mt-4 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            Set <code>READER_ADMIN_PASSWORD</code> and a 32+ character <code>READER_SESSION_SECRET</code>.
          </div>
        ) : null}
        {searchParams.error ? <p className="mt-4 text-sm text-red-600 dark:text-red-300">Invalid password.</p> : null}
        <form className="mt-5 flex flex-col gap-3" action="/api/auth/login" method="post">
          <input type="hidden" name="redirectTo" value={searchParams.redirectTo || '/admin/repos'} />
          <input
            name="password"
            type="password"
            className="min-h-10 rounded-md border bg-transparent px-3 text-sm outline-none focus:border-fd-primary"
            placeholder="Password"
            disabled={!canLogin}
          />
          <button
            type="submit"
            disabled={!canLogin}
            className="rounded-md bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground disabled:opacity-60"
          >
            Log in
          </button>
        </form>
      </div>
    </main>
  );
}
