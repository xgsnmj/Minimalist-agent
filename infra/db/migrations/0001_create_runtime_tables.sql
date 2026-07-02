-- Initial runtime persistence tables for Minimalist Agent.

CREATE TABLE IF NOT EXISTS artifacts (
  id INT NOT NULL AUTO_INCREMENT,
  conversation_id INT NOT NULL,
  run_id INT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  preview_type VARCHAR(32) NOT NULL,
  metadata JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX ix_artifacts_conversation_id (conversation_id),
  INDEX ix_artifacts_run_id (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_attachments (
  id INT NOT NULL AUTO_INCREMENT,
  conversation_id INT NOT NULL,
  run_id INT NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(1024) NOT NULL,
  preview_type VARCHAR(32) NOT NULL,
  metadata JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX ix_run_attachments_conversation_id (conversation_id),
  INDEX ix_run_attachments_run_id (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_run_events (
  id INT NOT NULL AUTO_INCREMENT,
  run_id INT NOT NULL,
  sequence INT NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  data JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX ix_agent_run_events_run_id (run_id),
  INDEX ix_agent_run_events_sequence (sequence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
