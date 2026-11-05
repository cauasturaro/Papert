"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Navbar } from "@/components/app/navbar";
import { Button } from "@/components/ui/button/button";
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
  const router = useRouter();
  const {
    user,
    register,
    loading,
    busy,
    message,
    submitCredentials,
    toggleRegistration,
  } = useAccount();

  // Signed-in users have nothing to do here, so send them to their study space.
  useEffect(() => {
    if (user) {
      router.replace("/study");
    }
  }, [user, router]);

  let title = "Welcome back";
  let status = loading ? "Checking your session…" : message;
  let submitLabel = register ? "Create account" : "Sign in";

  if (register) {
    title = "Create your account";
  }

  if (user) {
    status = "Opening your study space…";
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
              {status}
            </CardDescription>
          </CardHeader>

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
