-- 001: every suite is 2 bedrooms, bookable as 1 bedroom or the whole suite.
-- Run once on a database created before this change (the app does the same automatically on
-- start, so you only need this if you manage the schema by hand).
-- If the columns already exist, MySQL reports "Duplicate column name": that means it's already applied.

ALTER TABLE dal_units
  ADD COLUMN room_price  INT     NULL AFTER price,
  ADD COLUMN room_sleeps TINYINT NULL AFTER room_price;

-- Convert the four starting suites, only where they are still exactly as first seeded
-- (110/123 seeded as 1-bedroom KES 2,500; 115/117 as 2-bedroom KES 5,000).
UPDATE dal_units SET bedrooms = 2, sleeps = 4, price = 5000, room_price = 2500, room_sleeps = 2,
  description = CASE code
    WHEN '110' THEN 'Modern, stylish two-bedroom suite with a cozy sitting area. Book one bedroom or the whole suite.'
    WHEN '123' THEN 'Clean, spacious two-bedroom suite. Quiet and secluded, ideal for resting.'
    WHEN '115' THEN 'Spacious, cozy two-bedroom suite. Perfect for families.'
    WHEN '117' THEN 'Secluded two-bedroom corner suite, made for rest and longer stays.'
  END
WHERE code IN ('110', '123', '115', '117')
  AND ((bedrooms = 1 AND sleeps = 2 AND price = 2500) OR (bedrooms = 2 AND sleeps = 4 AND price = 5000));
