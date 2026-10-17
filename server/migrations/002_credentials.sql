CREATE TABLE credentials (
    fingerprint text PRIMARY KEY,
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    public_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_challenges (
    id text PRIMARY KEY, public_key text NOT NULL, message text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '2 minutes'
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at);
CREATE TABLE auth_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, count integer NOT NULL);
CREATE TABLE external_identities (
    issuer text NOT NULL, subject text NOT NULL,
    owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    PRIMARY KEY(issuer,subject)
);
CREATE TABLE browser_flows (
    id text PRIMARY KEY, client_state text NOT NULL, client_challenge text NOT NULL,
    redirect_uri text NOT NULL, provider_state text NOT NULL UNIQUE, nonce text NOT NULL,
    provider_verifier text NOT NULL, issuer text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','complete')),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE TABLE browser_codes (
    code_hash text PRIMARY KEY, owner text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    challenge text NOT NULL, redirect_uri text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds'
);
