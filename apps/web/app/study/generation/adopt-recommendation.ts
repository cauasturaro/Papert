export async function adoptRecommendation<T>(
  create: () => Promise<T>,
  discard: () => Promise<unknown>,
  open: (destination: T) => void,
) {
  const destination = await create();

  await discard();

  open(destination);
}
