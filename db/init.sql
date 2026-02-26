-- DeployLite Database Schema
-- ===========================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    avatar_url TEXT,
    bio TEXT,
    company VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repo_url TEXT,
    tech_stack VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'building', 'failed')),
    preview_url TEXT,
    build_config JSONB DEFAULT '{}',
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Builds table
CREATE TABLE builds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    triggered_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
    build_script TEXT,
    repo_url TEXT,
    log_output TEXT,
    duration_ms INTEGER,
    commit_sha VARCHAR(40),
    branch VARCHAR(100) DEFAULT 'main',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_builds_project ON builds(project_id);
CREATE INDEX idx_builds_triggered_by ON builds(triggered_by);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- Seed admin user (password: D3pl0y!Admin2024)
-- bcrypt hash of D3pl0y!Admin2024
INSERT INTO users (id, email, username, password_hash, role, company, bio) VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'admin@deploylite.io',
    'dl_admin',
    '$2b$12$LJ3m5ZQxKOFf2k9jR8QzXeKp1wXxYK9vN3mP4hG7tR6yU8iO2sDfK',
    'admin',
    'DeployLite Inc.',
    'Platform administrator. Building the future of deployment.'
);

-- Seed sample projects
INSERT INTO projects (name, description, repo_url, tech_stack, status, owner_id, is_public) VALUES
(
    'NextCommerce',
    'Full-stack e-commerce platform built with Next.js 14, featuring server components, edge functions, and Stripe integration. Deployed across 3 regions with automatic failover.',
    'https://github.com/deploylite/nextcommerce',
    'Next.js, TypeScript, Prisma, PostgreSQL',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    true
),
(
    'GoMetrics',
    'High-performance metrics aggregation service written in Go. Processes 100k+ events/sec with sub-millisecond p99 latency. Uses ClickHouse for time-series storage.',
    'https://github.com/deploylite/gometrics',
    'Go, ClickHouse, gRPC, Prometheus',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    true
),
(
    'MLPipeline',
    'Automated ML training pipeline with experiment tracking, model versioning, and A/B deployment. Supports PyTorch and TensorFlow workloads on Kubernetes.',
    'https://github.com/deploylite/mlpipeline',
    'Python, FastAPI, Kubernetes, Redis',
    'active',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    false
),
(
    'EdgeWorker',
    'Serverless edge computing runtime for deploying JavaScript workers globally. Features V8 isolates, WebSocket support, and KV storage.',
    'https://github.com/deploylite/edgeworker',
    'Rust, V8, WebAssembly, Cloudflare',
    'building',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    true
);

-- Seed sample builds
INSERT INTO builds (project_id, triggered_by, status, build_script, log_output, duration_ms, commit_sha, branch) VALUES
(
    (SELECT id FROM projects WHERE name = 'NextCommerce'),
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'success',
    'npm ci && npm run build && npm run test',
    E'[2024-01-15 10:23:01] Cloning repository...\n[2024-01-15 10:23:04] Installing dependencies...\n[2024-01-15 10:23:18] npm ci: added 1,247 packages in 14s\n[2024-01-15 10:23:19] Running build...\n[2024-01-15 10:23:45] ✓ Compiled successfully\n[2024-01-15 10:23:45] Running tests...\n[2024-01-15 10:23:52] Tests: 47 passed, 0 failed\n[2024-01-15 10:23:52] Build completed successfully.',
    51000,
    'a4f8c2e1',
    'main'
),
(
    (SELECT id FROM projects WHERE name = 'GoMetrics'),
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'success',
    'go build -o bin/gometrics ./cmd/server && go test ./...',
    E'[2024-01-14 14:10:00] Cloning repository...\n[2024-01-14 14:10:03] Building binary...\n[2024-01-14 14:10:08] go build: compiled successfully\n[2024-01-14 14:10:09] Running tests...\n[2024-01-14 14:10:15] ok  \tgometrics/internal/aggregator\t2.1s\n[2024-01-14 14:10:18] ok  \tgometrics/internal/storage\t3.4s\n[2024-01-14 14:10:19] ok  \tgometrics/pkg/client\t0.8s\n[2024-01-14 14:10:19] Build completed successfully.',
    19000,
    'b7e3d9f0',
    'main'
),
(
    (SELECT id FROM projects WHERE name = 'EdgeWorker'),
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'failed',
    'cargo build --release && cargo test',
    E'[2024-01-16 09:00:01] Cloning repository...\n[2024-01-16 09:00:05] Building release binary...\n[2024-01-16 09:01:22] error[E0308]: mismatched types\n  --> src/runtime/isolate.rs:142:5\n   |\n142 |     context.execute(script)\n   |     ^^^^^^^^^^^^^^^^^^^^^^^ expected `Result<Value>`, found `Value`\n[2024-01-16 09:01:22] Build failed with 1 error.',
    81000,
    'c1d5a8b2',
    'feature/wasm-support'
);

-- Seed audit logs
INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address) VALUES
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'user.login',
    'auth',
    '{"method": "password", "success": true}',
    '10.0.1.50'
),
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'build.trigger',
    'build',
    '{"project": "NextCommerce", "branch": "main"}',
    '10.0.1.50'
),
(
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'project.create',
    'project',
    '{"name": "EdgeWorker", "tech_stack": "Rust, V8, WebAssembly"}',
    '10.0.1.50'
);
