CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL, pass_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle');
CREATE TABLE IF NOT EXISTS trust_edges (
  owner_user_id TEXT NOT NULL, trusted_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, trusted_user_id));
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS task_scopes (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  purpose TEXT NOT NULL, fields_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subchats (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
  outcome TEXT, summary TEXT, closed_at INTEGER);
CREATE TABLE IF NOT EXISTS subchat_participants (
  subchat_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  PRIMARY KEY (subchat_id, agent_id));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, task_id TEXT,
  subchat_id TEXT, sender_type TEXT NOT NULL, sender_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
  classification TEXT NOT NULL, field_tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT,
  description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS disclosures (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
  requester_agent_id TEXT NOT NULL, scope_json TEXT NOT NULL,
  released_json TEXT NOT NULL, withheld_count INTEGER NOT NULL,
  decision TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
