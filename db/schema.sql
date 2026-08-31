-- ============================================================
-- Casino Criptoporno — Database schema (PostgreSQL)
-- Tables: users, user_inventory, best_drops, transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    tg_id         BIGINT       UNIQUE NOT NULL,
    username      TEXT,
    first_name    TEXT,
    balance_stars BIGINT       NOT NULL DEFAULT 0 CHECK (balance_stars >= 0),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users (tg_id);

CREATE TABLE IF NOT EXISTS user_inventory (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id      TEXT         NOT NULL,          -- stable item id from cases data
    name         TEXT         NOT NULL,
    image        TEXT,
    rarity       TEXT,
    price_stars  BIGINT       NOT NULL DEFAULT 0 CHECK (price_stars >= 0),
    status       TEXT         NOT NULL DEFAULT 'owned',  -- 'owned' | 'pending_withdraw'
    won_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_user ON user_inventory (user_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_user_item ON user_inventory (user_id, item_id);

CREATE TABLE IF NOT EXISTS best_drops (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id      TEXT         NOT NULL,
    name         TEXT         NOT NULL,
    image        TEXT,
    rarity       TEXT,
    price_stars  BIGINT       NOT NULL DEFAULT 0 CHECK (price_stars >= 0),
    won_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (user_id, item_id, won_at)
);

CREATE INDEX IF NOT EXISTS idx_best_drops_user ON best_drops (user_id, price_stars DESC);

CREATE TABLE IF NOT EXISTS transactions (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type           TEXT         NOT NULL,   -- 'open_case' | 'sell' | 'withdraw' | 'deposit'
    amount_stars   BIGINT       NOT NULL DEFAULT 0,  -- signed: negative = spend, positive = credit
    item_id        TEXT,
    meta           JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id, created_at DESC);

-- Lock + safe atomic debit. Returns the locked user row (FOR UPDATE) or NULL.
-- Used inside a transaction to serialise opens/sells (race-condition protection).
CREATE OR REPLACE FUNCTION lock_user(p_user_id BIGINT)
RETURNS SETOF users AS $$
BEGIN
    RETURN QUERY SELECT * FROM users WHERE id = p_user_id FOR UPDATE;
END;
$$ LANGUAGE plpgsql;