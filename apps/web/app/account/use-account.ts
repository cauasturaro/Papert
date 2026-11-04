import { useState, type FormEvent } from "react";
import { useSessionContext } from "@/components/app/session-provider";
import {
  AuthRequestError,
  submitCredentials as authenticate,
} from "@/lib/auth/auth-api";

export function useAccount() {
  const session = useSessionContext();
  const [register, setRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const fields = new FormData(form);

    session.beginAuthChange();
    setSubmitting(true);
    session.setMessage("");

    try {
      const data = await authenticate(register, {
        email: fields.get("email"),
        password: fields.get("password"),
      });

      session.setUser(data.user);
      form.reset();
    } catch (error) {
      session.setMessage(
        error instanceof AuthRequestError
          ? error.message
          : "The service is unavailable. Your form is still here; please try again.",
      );
    } finally {
      session.beginAuthChange();
      setSubmitting(false);
    }
  }

  function toggleRegistration() {
    setRegister(!register);
    session.setMessage("");
  }

  return {
    user: session.user,
    register,
    loading: session.loading,
    busy: submitting || session.signingOut,
    message: session.message,
    submitCredentials,
    logout: session.logout,
    toggleRegistration,
  };
}
