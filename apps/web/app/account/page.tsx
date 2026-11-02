"use client";

import Link from "next/link";
import { useAccount } from "./use-account";

export default function Account() {
  const {
    user,
    register,
    loading,
    busy,
    message,
    submitCredentials,
    logout,
    toggleRegistration,
  } = useAccount();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-6 py-16">
      <Link href="/" className="text-sm underline">
        Papert / Learn by building
      </Link>
      <h1 className="text-3xl font-semibold">
        {user
          ? "Your account"
          : register
            ? "Create your account"
            : "Welcome back"}
      </h1>
      <p role="status" aria-live="polite">
        {loading ? "Checking your session…" : message}
      </p>
      {!loading &&
        (user ? (
          <section
            className="flex flex-col gap-4"
            aria-label="Protected account"
          >
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <p>Your private study space starts here.</p>
            <button
              className="auth-button"
              type="button"
              onClick={logout}
              disabled={busy}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </section>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={submitCredentials}
            aria-busy={busy}
          >
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              className="auth-input"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              className="auth-input"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 15 : 1}
              maxLength={128}
              aria-describedby="password-help"
            />
            <p id="password-help" className="text-sm">
              {register
                ? "Use at least 15 characters, up to 128 bytes. Spaces and password managers are welcome."
                : "Enter the password you used to create your account."}
            </p>
            <button className="auth-button" type="submit" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="underline"
              disabled={busy}
              onClick={toggleRegistration}
            >
              {register
                ? "Already have an account? Sign in"
                : "New to Papert? Create an account"}
            </button>
          </form>
        ))}
    </main>
  );
}
