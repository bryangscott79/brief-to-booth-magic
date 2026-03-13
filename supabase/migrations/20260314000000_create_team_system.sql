-- Team members with roles
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'designer', 'viewer')),
  display_name text NOT NULL,
  invited_email text,
  invited_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, team_owner_id)
);

-- Project-scoped invite links for contractors
CREATE TABLE IF NOT EXISTS project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  email text,
  scope text NOT NULL CHECK (scope IN ('upload_only', 'view_comment', 'full_edit')),
  label text,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner_id ON team_members(team_owner_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_token ON project_invites(token);
CREATE INDEX IF NOT EXISTS idx_project_invites_project_id ON project_invites(project_id);

-- RLS for team_members
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own team memberships"
  ON team_members FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = team_owner_id);

CREATE POLICY "Team owners can insert team members"
  ON team_members FOR INSERT
  WITH CHECK (auth.uid() = team_owner_id);

CREATE POLICY "Team owners can update their team members"
  ON team_members FOR UPDATE
  USING (auth.uid() = team_owner_id);

CREATE POLICY "Team owners can delete their team members"
  ON team_members FOR DELETE
  USING (auth.uid() = team_owner_id);

-- RLS for project_invites
ALTER TABLE project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invite creators can manage their invites"
  ON project_invites FOR ALL
  USING (auth.uid() = created_by);

CREATE POLICY "Anyone can view invites by token for acceptance"
  ON project_invites FOR SELECT
  USING (true);

-- RLS helper function: returns project IDs a user can access
CREATE OR REPLACE FUNCTION get_accessible_project_ids(uid uuid)
RETURNS SETOF uuid AS $$
  -- Projects the user owns
  SELECT id FROM projects WHERE user_id = uid
  UNION
  -- Projects owned by a team the user belongs to
  SELECT p.id FROM projects p
  JOIN team_members tm ON tm.team_owner_id = p.user_id
  WHERE tm.user_id = uid AND tm.accepted_at IS NOT NULL
  UNION
  -- Projects the user has an accepted invite to
  SELECT pi.project_id FROM project_invites pi
  WHERE pi.accepted_by = uid AND pi.expires_at > now()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
