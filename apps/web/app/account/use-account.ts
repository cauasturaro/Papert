import { useState, type FormEvent } from "react";
import { useSessionContext } from "@/components/app/session-provider";
import {
  AuthRequestError,
  submitCredentials as authenticate,
} from "@/lib/auth/auth-api";

export type AccountMode = "signin" | "register";

/** Which field a failed sign-in or registration points at, for `aria-invalid`. */
export type InvalidField = "email" | "password" | "both" | null;

function invalidFieldFor(status: number, register: boolean): InvalidField {
  if (status === 400) {
    return register ? "password" : "both";
  }

  if (status === 401) {
    return "both";
  }

  if (status === 409) {
    return "email";
  }

  return null;
}

export function useAccount(initialMode: AccountMode = "signin") {
  const session = useSessionContext();
  const [register, setRegister] = useState(initialMode === "register");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<InvalidField>(null);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const fields = new FormData(form);

    session.beginAuthChange();
    setSubmitting(true);
    setError("");
    setInvalidField(null);
    session.setMessage("");

    try {
      const data = await authenticate(register, {
        email: fields.get("email"),
        password: fields.get("password"),
      });

      session.setUser(data.user);
      form.reset();
    } catch (failure) {
      if (failure instanceof AuthRequestError) {
        setError(failure.message);
        setInvalidField(invalidFieldFor(failure.status, register));
      } else {
        setError(
          "Papert could not be reached. Your details are still here; try again.",
        );
      }
    } finally {
      session.beginAuthChange();
      setSubmitting(false);
    }
  }

  function toggleRegistration() {
    setRegister(!register);
    setError("");
    setInvalidField(null);
    session.setMessage("");
  }

  return {
    user: session.user,
    register,
    loading: session.loading,
    submitting,
    busy: submitting || session.signingOut,
    message: session.message,
    error,
    invalidField,
    submitCredentials,
    logout: session.logout,
    toggleRegistration,
  };
}
