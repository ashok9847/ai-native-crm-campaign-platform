-- Nudge initial schema migration (54d820ac140d)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- This replaces `alembic upgrade head` when asyncpg cannot connect via PgBouncer.

BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade -> 54d820ac140d

CREATE TABLE customers (
    id SERIAL NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    subscription_tier VARCHAR(20) NOT NULL,
    roast_preference VARCHAR(50) NOT NULL,
    last_order_date DATE NOT NULL,
    lifetime_value NUMERIC(10, 2) NOT NULL,
    city VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_customers_subscription_tier CHECK (subscription_tier IN ('starter', 'premium', 'elite')),
    CONSTRAINT ck_customers_lifetime_value_non_negative CHECK (lifetime_value >= 0),
    UNIQUE (email)
);

CREATE UNIQUE INDEX customers_email_idx ON customers (email);

CREATE TABLE campaigns (
    id SERIAL NOT NULL,
    name VARCHAR(255) NOT NULL,
    intent TEXT NOT NULL,
    state VARCHAR(20) DEFAULT 'DRAFT' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    state_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    stalled_at TIMESTAMP WITH TIME ZONE,
    ai_summary TEXT,
    PRIMARY KEY (id),
    CONSTRAINT ck_campaigns_state CHECK (state IN ('DRAFT','SEGMENTING','GENERATING','REVIEWING','EXECUTING','COMPLETE'))
);

CREATE TABLE segments (
    id SERIAL NOT NULL,
    campaign_id INTEGER NOT NULL,
    filter_criteria JSONB NOT NULL,
    customer_count INTEGER NOT NULL,
    sample_customer_ids INTEGER[] NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE
);

CREATE INDEX segments_campaign_id_idx ON segments (campaign_id);

CREATE TABLE segment_customers (
    segment_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    PRIMARY KEY (segment_id, customer_id),
    FOREIGN KEY(customer_id) REFERENCES customers (id) ON DELETE CASCADE,
    FOREIGN KEY(segment_id) REFERENCES segments (id) ON DELETE CASCADE
);

CREATE TABLE campaign_messages (
    id SERIAL NOT NULL,
    campaign_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    edited BOOLEAN DEFAULT 'false' NOT NULL,
    edited_body TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES customers (id),
    CONSTRAINT uq_campaign_messages_campaign_customer UNIQUE (campaign_id, customer_id)
);

CREATE INDEX campaign_messages_campaign_id_idx ON campaign_messages (campaign_id);

CREATE TABLE delivery_events (
    id SERIAL NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    campaign_message_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_retry BOOLEAN DEFAULT 'false' NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_delivery_events_status CHECK (status IN ('sent','delivered','opened','clicked','failed')),
    FOREIGN KEY(campaign_message_id) REFERENCES campaign_messages (id),
    UNIQUE (event_id)
);

CREATE UNIQUE INDEX delivery_events_event_id_idx ON delivery_events (event_id);
CREATE INDEX delivery_events_message_id_idx ON delivery_events (campaign_message_id);

INSERT INTO alembic_version (version_num) VALUES ('54d820ac140d');

COMMIT;
