-- Keep in sync with DAILY_LIMIT in src/executions/domain/execution.ts.
ALTER TABLE core.execution_quota DROP CONSTRAINT execution_quota_check;

ALTER TABLE core.execution_quota
  ADD CONSTRAINT execution_quota_check CHECK (used + reserved <= 100000);
