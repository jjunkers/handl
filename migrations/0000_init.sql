CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    hashedPassword TEXT NOT NULL,
    status TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    time TEXT
);

CREATE TABLE IF NOT EXISTS user_connections (
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    PRIMARY KEY (follower_id, followed_id)
);

CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    config TEXT -- JSON string for categories, shops, templateItems
);

CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    checked INTEGER DEFAULT 0,
    shop_id TEXT,
    last_checked_at INTEGER,
    quantity TEXT,
    FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE
);
