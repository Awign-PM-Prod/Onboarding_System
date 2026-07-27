-- Convert legacy FH holidays to NH
UPDATE client_holidays SET holiday_type = 'NH' WHERE holiday_type = 'FH';

-- Policy change audit log
CREATE TABLE IF NOT EXISTS client_policy_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role text,
  changes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_policy_change_logs_client_created_idx
  ON client_policy_change_logs (client_id, created_at DESC);
