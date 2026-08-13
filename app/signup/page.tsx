import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import PasswordInput from "@/app/components/PasswordInput";
import ConfirmEmailInput from "@/app/components/ConfirmEmailInput";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm sm:max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">Create your account</h1>
      <p className="mb-6 text-sm text-muted">
        One account gets you into both the Survivor Pool and the Pick&apos;em Pool.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          {params.error}
        </p>
      )}

      <form action={signUp} className="flex flex-col gap-4">
        {/* Honeypot — invisible to real users, tabIndex/autoComplete off so
            assistive tech skips it too. Bots that auto-fill every field trip
            this; the server action rejects silently, no CAPTCHA needed. */}
        <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
          <label htmlFor="website">Leave this field blank</label>
          <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="mb-1 block text-sm font-medium text-ink">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              autoComplete="given-name"
              className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="mb-1 block text-sm font-medium text-ink">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              required
              autoComplete="family-name"
              className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium text-ink">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            placeholder="(555) 555-5555"
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
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
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <label htmlFor="confirmEmail" className="mb-1 block text-sm font-medium text-ink">
            Confirm email
          </label>
          <ConfirmEmailInput id="confirmEmail" name="confirmEmail" />
          <p className="mt-1 text-xs text-muted">Retype it — pasting is disabled here so a typo doesn&apos;t slip through both fields.</p>
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink">
            Password
          </label>
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-ink">
            Confirm password
          </label>
          <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-gold-500 px-4 py-2.5 text-base font-semibold text-app transition hover:bg-gold-600"
        >
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-gold-400 hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
