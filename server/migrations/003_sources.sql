CREATE TABLE sources (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    id text NOT NULL,
    document jsonb NOT NULL,
    enabled boolean NOT NULL,
    blocked boolean NOT NULL,
    deleted boolean NOT NULL,
    next_poll bigint NOT NULL,
    PRIMARY KEY(owner,id)
);
CREATE INDEX sources_due ON sources(next_poll) WHERE enabled AND NOT blocked AND NOT deleted;
CREATE TABLE source_runs (
    owner text NOT NULL,
    id text NOT NULL,
    source_id text NOT NULL,
    slot text NOT NULL,
    document jsonb NOT NULL,
    state text NOT NULL,
    available bigint NOT NULL,
    lease_until bigint NOT NULL,
    PRIMARY KEY(owner,id),
    UNIQUE(owner,source_id,slot),
    FOREIGN KEY(owner,source_id) REFERENCES sources(owner,id) ON DELETE CASCADE
);
CREATE INDEX source_runs_due ON source_runs(available,owner) WHERE state IN ('queued','running');
CREATE INDEX source_runs_source ON source_runs(owner,source_id,state);
CREATE TABLE raw_items (
    owner text NOT NULL,
    id text NOT NULL,
    source_id text NOT NULL,
    external_key text NOT NULL,
    document jsonb NOT NULL,
    PRIMARY KEY(owner,id),
    UNIQUE(owner,source_id,external_key),
    FOREIGN KEY(owner,source_id) REFERENCES sources(owner,id) ON DELETE CASCADE
);
CREATE TABLE raw_item_revisions (
    owner text NOT NULL,
    item_id text NOT NULL,
    revision integer NOT NULL,
    document jsonb NOT NULL,
    PRIMARY KEY(owner,item_id,revision),
    FOREIGN KEY(owner,item_id) REFERENCES raw_items(owner,id) ON DELETE CASCADE
);
CREATE TABLE source_requests (
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    operation text NOT NULL,
    key text NOT NULL,
    payload_hash text NOT NULL,
    response jsonb NOT NULL,
    created bigint NOT NULL,
    PRIMARY KEY(owner,operation,key)
);
