export const awsOptions = () => ({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || undefined,
  maxAttempts: 3,
});
