import { z } from 'zod';
import { AuthError } from '../../domain/auth.js';
import type { Credentials } from '../../domain/credentials.js';

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z
    .string()
    .min(1)
    .refine((p) => Buffer.byteLength(p) <= 128, {
      error: 'This password is too long. Use a shorter one.',
    }),
});

export function parseCredentials(body: unknown): Credentials {
  const result = CredentialsSchema.safeParse(body);
  if (!result.success) {
    throw new AuthError(
      'invalid',
      'Enter a valid email address and a password. Very long passwords are not accepted.',
    );
  }

  return result.data;
}
