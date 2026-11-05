"use client";

import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { RequestError } from "@/lib/api/request";

/** A failed community load: signed-out learners get a sign-in link, others a retry. */
export function LoadErrorAlert({
  error,
  title,
  onRetry,
}: {
  error: Error;
  title: string;
  onRetry: () => void;
}) {
  const signedOut = error instanceof RequestError && error.status === 401;

  let action = (
    <Button size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  );

  if (signedOut) {
    action = (
      <Link href="/account" className={buttonVariants({ size: "sm" })}>
        Go to sign in
      </Link>
    );
  }

  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{signedOut ? "Sign in to explore" : title}</AlertTitle>

      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{error.message}</span>
        {action}
      </AlertDescription>
    </Alert>
  );
}
