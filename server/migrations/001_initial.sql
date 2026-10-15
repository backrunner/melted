CREATE TABLE accounts (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    generation bigint NOT NULL DEFAULT 1,
    change_sequence bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session_families (
    id text PRIMARY KEY,
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    revoked boolean NOT NULL DEFAULT false,
    expires_at timestamptz NOT NULL
);
CREATE TABLE sessions (
    refresh_hash text PRIMARY KEY,
    access_hash text NOT NULL UNIQUE,
    family_id text NOT NULL REFERENCES session_families(id) ON DELETE CASCADE,
    used boolean NOT NULL DEFAULT false,
    access_expires_at timestamptz NOT NULL
);
CREATE TABLE terms (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('category','tag','subject')),
    name text NOT NULL,
    PRIMARY KEY (owner,id)
);
CREATE TABLE briefings (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id text NOT NULL,
    document jsonb NOT NULL,
    category_id text,
    title text NOT NULL,
    search_text text NOT NULL,
    updated_at timestamptz NOT NULL,
    read boolean NOT NULL DEFAULT false,
    saved boolean NOT NULL DEFAULT false,
    hidden boolean NOT NULL DEFAULT false,
    state_version bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (owner,id),
    FOREIGN KEY (owner,category_id) REFERENCES terms(owner,id)
);
CREATE INDEX briefings_order ON briefings(owner,updated_at DESC,id DESC);
CREATE TABLE briefing_terms (
    owner text NOT NULL,
    briefing_id text NOT NULL,
    term_id text NOT NULL,
    PRIMARY KEY (owner,briefing_id,term_id),
    FOREIGN KEY (owner,briefing_id) REFERENCES briefings(owner,id) ON DELETE CASCADE,
    FOREIGN KEY (owner,term_id) REFERENCES terms(owner,id) ON DELETE CASCADE
);
CREATE TABLE changes (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    sequence bigint NOT NULL,
    entity_id text NOT NULL,
    kind text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner,sequence)
);
CREATE TABLE mutations (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id text NOT NULL,
    payload_hash text NOT NULL,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (owner,id)
);
CREATE TABLE query_snapshots (
    id text PRIMARY KEY,
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    query_hash text NOT NULL,
    documents jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
    created_at timestamptz NOT NULL DEFAULT now()
);
