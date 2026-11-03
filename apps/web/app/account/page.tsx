"use client";

import Link from "next/link";
import { Navbar } from "@/components/app/navbar";
import { Button, buttonVariants } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card/card";
import {
  FormDescription,
  FormField,
  FormLabel,
} from "@/components/ui/form-field/form-field";
import { Input } from "@/components/ui/input/input";
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

  let title = "Welcome back";
  let submitLabel = register ? "Create account" : "Sign in";

  if (user) {
    title = "Your account";
  } else if (register) {
    title = "Create your account";
  }

  if (busy) {
    submitLabel = "Please wait…";
  }

  return (
    <>
      <Navbar />

      <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
        <Card className="max-w-md shadow-xl shadow-foreground/5">
          <CardHeader>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <CardDescription role="status" aria-live="polite">
              {loading ? "Checking your session…" : message}
            </CardDescription>
          </CardHeader>

          {!loading && user && (
            <CardContent>
              <section
                className="flex flex-col gap-4"
                aria-label="Protected account"
              >
                <p>
                  Signed in as <strong>{user.email}</strong>
                </p>

                <Link className={buttonVariants()} href="/study">
                  Start or resume your study
                </Link>
                <Button variant="outline" onClick={logout} disabled={busy}>
                  {busy ? "Signing out…" : "Sign out"}
                </Button>
              </section>
            </CardContent>
          )}

          {!loading && !user && (
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={submitCredentials}
                aria-busy={busy}
              >
                <FormField>
                  <FormLabel htmlFor="email">Email</FormLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </FormField>

                <FormField>
                  <FormLabel htmlFor="password">Password</FormLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    required
                    minLength={register ? 8 : 1}
                    pattern={
                      register ? "(?=.*\\p{L})(?=.*\\p{Nd}).*" : undefined
                    }
                    title={
                      register
                        ? "Include at least one letter and one number."
                        : undefined
                    }
                    maxLength={128}
                    aria-describedby="password-help"
                  />
                  <FormDescription id="password-help">
                    {register
                      ? "Use at least 8 characters, including one letter and one number, up to 128 bytes. No symbols or uppercase letters required."
                      : "Enter the password you used to create your account."}
                  </FormDescription>
                </FormField>

                <Button type="submit" disabled={busy}>
                  {submitLabel}
                </Button>
                <Button
                  variant="link"
                  disabled={busy}
                  onClick={toggleRegistration}
                >
                  {register
                    ? "Already have an account? Sign in"
                    : "New to Papert? Create an account"}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </main>
    </>
  );
}
