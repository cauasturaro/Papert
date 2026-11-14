export interface DatabaseProbe {
  check(): Promise<void>;
}
