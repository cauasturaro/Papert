// What executions need from Study to run a roadmap generation.

export type GenerationRequest = {
  requestKey: string;
  kind: 'generation';
  effort?: 'low' | 'medium';
};

export type GenerationLevel = 'beginner' | 'intermediate' | 'advanced';

// Only infrastructure may unwrap this caller-owned transaction.
export type DraftTransaction = object;
