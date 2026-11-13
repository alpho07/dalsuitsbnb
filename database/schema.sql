-- DAL Suits BnB: MySQL schema (MySQL 5.7+ / MariaDB 10.3+)
--
-- You don't have to run this: the app creates these tables itself on first start
-- (lib/store.js and lib/units.js), and every statement is "IF NOT EXISTS" / "INSERT IGNORE",
-- so running it on an existing database changes nothing.
-- Use it to set up the database ahead of time in phpMyAdmin (Import), or as a reference.
-- Keep it in step with the CREATE TABLE statements in lib/store.js and lib/units.js.

SET NAMES utf8mb4;

-- Conversation state, bot pauses and webhook de-duplication (rows expire via `exp`, epoch ms)
CREATE TABLE IF NOT EXISTS dal_kv (
  k   VARCHAR(191) NOT NULL PRIMARY KEY,
  v   MEDIUMTEXT   NOT NULL,
  exp BIGINT       NULL,
  INDEX (exp)
) CHARACTER SET utf8mb4;

-- Bookings from WhatsApp and the website. `suite` holds the unit number (dal_units.code).
-- `data` is the full booking as JSON; rows are deleted 90 days after check-out (`expires_at`, epoch ms).
CREATE TABLE IF NOT EXISTS dal_bookings (
  ref        VARCHAR(32)  NOT NULL PRIMARY KEY,
  suite      VARCHAR(8)   NOT NULL,
  check_in   DATE         NOT NULL,
  check_out  DATE         NOT NULL,
  guests     INT          NOT NULL DEFAULT 0,
  name       VARCHAR(120) NOT NULL DEFAULT '',
  phone      VARCHAR(20)  NOT NULL DEFAULT '',
  status     VARCHAR(16)  NOT NULL,             -- pending | confirmed | declined | cancelled | blocked
  source     VARCHAR(16)  NOT NULL DEFAULT '',  -- whatsapp | website | admin
  notes      TEXT,
  data       MEDIUMTEXT   NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at BIGINT       NOT NULL,
  INDEX (check_in), INDEX (status), INDEX (expires_at)
) CHARACTER SET utf8mb4;

-- Units (suites) managed at /admin
CREATE TABLE IF NOT EXISTS dal_units (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(16)  NOT NULL UNIQUE,      -- unit number shown to guests, e.g. 110
  name        VARCHAR(80)  NOT NULL,
  block       VARCHAR(16)  NOT NULL DEFAULT '',
  bedrooms    TINYINT      NOT NULL DEFAULT 1,
  sleeps      TINYINT      NOT NULL DEFAULT 2,
  price       INT          NOT NULL DEFAULT 0,   -- KES per night
  description TEXT,
  features    TEXT,                              -- JSON array of strings
  active      TINYINT      NOT NULL DEFAULT 1,   -- 0 = hidden from site and WhatsApp
  sort        INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

-- Unit photos (resized JPEGs, stored in the database so redeploys don't lose them)
CREATE TABLE IF NOT EXISTS dal_photos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  unit_id    INT          NOT NULL,
  mime       VARCHAR(32)  NOT NULL,
  data       MEDIUMBLOB   NOT NULL,
  bytes      INT          NOT NULL,
  caption    VARCHAR(140) NOT NULL DEFAULT '',
  sort       INT          NOT NULL DEFAULT 0,      -- 0 = cover photo
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (unit_id)
) CHARACTER SET utf8mb4;

-- Offers: percent off the stay, or KES off per night; unit_id NULL = all units
CREATE TABLE IF NOT EXISTS dal_discounts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  label      VARCHAR(80)  NOT NULL DEFAULT '',
  unit_id    INT          NULL,
  kind       VARCHAR(8)   NOT NULL,              -- percent | amount
  value      INT          NOT NULL,
  min_nights INT          NOT NULL DEFAULT 1,
  starts     DATE         NULL,                  -- applies to stays starting on/after
  ends       DATE         NULL,                  -- applies to stays starting on/before
  active     TINYINT      NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

-- Starting units (same as SEED_UNITS in lib/config.js); skipped if the numbers already exist
INSERT IGNORE INTO dal_units (code, name, block, bedrooms, sleeps, price, description, features, sort) VALUES
  ('110', 'Suite 110', 'A', 1, 2, 2500, 'Modern, stylish one-bedroom suite with a cozy sitting area. Perfect for couples.', '["Fast Wi-Fi","Smart TV: Netflix & YouTube","Private bathroom"]', 1),
  ('123', 'Suite 123', 'A', 1, 2, 2500, 'Clean, spacious one-bedroom suite. Quiet and secluded, ideal for resting.', '["Fast Wi-Fi","Smart TV: Netflix & YouTube","Work desk"]', 2),
  ('115', 'Suite 115', 'B', 2, 4, 5000, 'Spacious, cozy two-bedroom suite. Perfect for families.', '["Fast Wi-Fi","Smart TV: Netflix & YouTube","Lounge"]', 3),
  ('117', 'Suite 117', 'B', 2, 4, 5000, 'Secluded two-bedroom corner suite, made for rest and longer stays.', '["Fast Wi-Fi","Smart TV: Netflix & YouTube","Corner unit"]', 4);
