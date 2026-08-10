import Link from "next/link";
import { signIn } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm sm:max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">Log in</h1>
      <p className="mb-6 text-sm text-muted">Welcome back to CFBPools.</p>

      {params.reset === "success" && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Password updated — log in with your new password.
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          {params.error}
        </p>
      )}

      <form action={signIn} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-edge px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <Link href="/forgot-password" className="text-sm text-gold-400 hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-edge px-3 py-2 text-base focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-gold-500 px-4 py-2.5 text-base font-semibold text-app transition hover:bg-gold-600"
        >
          Log in
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-gold-400 hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
