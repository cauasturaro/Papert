import { z } from 'zod';
import { AuthError } from './auth.js';

const CredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email(),
  password: z
    .string()
    .min(1)
    .refine((p) => Buffer.byteLength(p) <= 128, {
      message: 'Password must not exceed 128 bytes.',
    }),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export function parseCredentials(body: unknown): Credentials {
  const result = CredentialsSchema.safeParse(body);
  if (!result.success) {
    throw new AuthError(
      400,
      'Enter a valid email and password (maximum 128 bytes).',
    );
  }
  return result.data;
}
