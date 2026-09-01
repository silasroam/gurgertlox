-- ============================================================
-- Casino Criptoporno — Database schema (PostgreSQL)
-- Tables: users, user_inventory, best_drops, transactions
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    tg_id         BIGINT       UNIQUE NOT NULL,
    username      TEXT,
    first_name    TEXT,
    custom_id     BIGINT,   -- публичный 8-значный ID (10000000..99999999), уникальный
    balance_stars BIGINT       NOT NULL DEFAULT 0 CHECK (balance_stars >= 0),
    last_active   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_tg_id ON users (tg_id);

-- Миграция существующих баз: добавить колонки, если их ещё нет
-- (ДО создания индексов, зависящих от custom_id).
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ NOT NULL DEFAULT now();

-- Уникальный Custom ID (покрывает и свежие, и мигрированные базы).
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_custom_id ON users (custom_id);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users (last_active DESC);

-- Бэктолл: присвоить случайный 8-значный ID тем, у кого его нет
-- (если кандидат совпал с существующим — строка останется NULL и дозаполнится
--  следующим прогоном схемы / первым заходом пользователя).
UPDATE users u
SET custom_id = c.cand
FROM (
    SELECT id, (10000000 + floor(random() * 90000000)::bigint) AS cand
    FROM users WHERE custom_id IS NULL
) c
WHERE u.id = c.id
  AND NOT EXISTS (SELECT 1 FROM users x WHERE x.custom_id = c.cand AND x.id <> c.id);

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
    type           TEXT         NOT NULL,   -- 'deposit' | 'case_open' | 'item_sell' | 'withdraw'
    amount_stars   BIGINT       NOT NULL DEFAULT 0,  -- signed: negative = spend, positive = credit
    item_id        TEXT,
    meta           JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id, created_at DESC);
-- Идемпотентность платежей Telegram Stars: один charge_id = одна запись deposit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_charge_id
    ON transactions ((meta->>'charge_id'))
    WHERE meta->>'charge_id' IS NOT NULL;

-- Lock + safe atomic debit. Returns the locked user row (FOR UPDATE) or NULL.
-- Used inside a transaction to serialise opens/sells (race-condition protection).
CREATE OR REPLACE FUNCTION lock_user(p_user_id BIGINT)
RETURNS SETOF users AS $$
BEGIN
    RETURN QUERY SELECT * FROM users WHERE id = p_user_id FOR UPDATE;
END;
$$ LANGUAGE plpgsql;