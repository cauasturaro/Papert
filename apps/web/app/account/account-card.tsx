"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card/card";
import { FormDescription, FormField, FormLabel } from "@/components/ui/form-field/form-field";
import { Input } from "@/components/ui/input/input";
import { safeNextPath } from "@/lib/auth/session-signal";
import { useAccount, type AccountMode } from "./use-account";

const PASSWORD_RULES =
  "At least 12 characters. A few unrelated words make a strong, memorable password.";

export function AccountCard() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next")) ?? "/study";
  const initialMode: AccountMode =
    params.get("mode") === "register" ? "register" : "signin";

  const account = useAccount(initialMode);
  const { user, register, loading, busy, submitting } = account;
  const [showPassword, setShowPassword] = useState(false);

  // Signed-in learners continue where they were going, or to their study space.
  useEffect(() => {
    if (user) {
      router.replace(next);
    }
  }, [user, router, next]);

  let title = "Welcome back";
  let description = "Sign in to continue learning.";
  let submitLabel = "Sign in";

  if (register) {
    title = "Create your free account";
    description = "Build real projects with Seymour, your AI tutor.";
    submitLabel = "Create account";
  }

  if (loading) {
    description = "Checking your session…";
  }

  if (user) {
    description = "Signed in. Opening Papert…";
  }

  const emailInvalid =
    account.invalidField === "email" || account.invalidField === "both";
  const passwordInvalid =
    account.invalidField === "password" || account.invalidField === "both";

  return (
    <Card className="max-w-md shadow-xl shadow-foreground/5">
      <CardHeader>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <CardDescription role="status" aria-live="polite">
          {description}
        </CardDescription>
      </CardHeader>

      {!loading && !user && (
        <CardContent className="space-y-4">
          {account.message && (
            <Alert size="sm">
              <AlertDescription>{account.message}</AlertDescription>
            </Alert>
          )}

          {account.error && (
            <Alert
              id="account-error"
              variant="destructive"
              size="sm"
              role="alert"
            >
              <AlertTitle>
                {register
                  ? "Your account was not created"
                  : "You are not signed in"}
              </AlertTitle>
              <AlertDescription>{account.error}</AlertDescription>
            </Alert>
          )}

          <form
            className="flex flex-col gap-4"
            onSubmit={account.submitCredentials}
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
                aria-invalid={emailInvalid || undefined}
                aria-describedby={emailInvalid ? "account-error" : undefined}
              />
            </FormField>

            <FormField>
              <div className="flex items-center justify-between gap-2">
                <FormLabel htmlFor="password">Password</FormLabel>

                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  className="h-auto px-0"
                  aria-controls="password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide password" : "Show password"}
                </Button>
              </div>

              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 12 : 1}
                aria-invalid={passwordInvalid || undefined}
                aria-describedby={
                  passwordInvalid
                    ? "password-help account-error"
                    : "password-help"
                }
              />

              <FormDescription id="password-help">
                {register
                  ? PASSWORD_RULES
                  : "The password you chose when you created your account."}
              </FormDescription>
            </FormField>

            <Button type="submit" loading={submitting} disabled={busy}>
              {submitLabel}
            </Button>

            <Button
              type="button"
              variant="link"
              disabled={busy}
              onClick={account.toggleRegistration}
            >
              {register
                ? "Already have an account? Sign in"
                : "New to Papert? Create a free account"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
