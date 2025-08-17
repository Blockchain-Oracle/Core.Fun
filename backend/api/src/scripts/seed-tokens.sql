-- Seed tokens data
INSERT INTO tokens (address, name, symbol, creator, raised, sold, status, description, website, twitter, telegram, image_url, total_supply, created_at)
VALUES 
(
  '0xB67E923C3e984e23c4d39502A76F7B634447f302',
  'Core Shiba',
  'CSIB',
  '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a',
  0.1220401,
  1220,
  'CREATED',
  'Shiba Inu''s best friend on Core Chain. To the moon! 🚀',
  'https://coreshiba.com',
  'https://twitter.com/coreshiba',
  'https://t.me/coreshibainu',
  'https://i.imgur.com/xUflLRs.jpg',
  '1000000000000000000000000',
  NOW() - INTERVAL '2 days'
),
(
  '0x65187E448809dAbe6251D8a8ae42D554e4ed4C05',
  'Pepe Core',
  'PEPEC',
  '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a',
  0.0313425,
  313,
  'CREATED',
  'The rarest Pepe on Core. Feels good man! 🐸',
  'https://pepecore.xyz',
  'https://twitter.com/pepecoincore',
  'https://t.me/pepecore',
  'https://i.imgur.com/KJFgfxV.png',
  '1000000000000000000000000',
  NOW() - INTERVAL '2 days'
),
(
  '0x8E4aC644A70A72Df192C075A0217698486d4b93b',
  'Doge Core',
  'DOGEC',
  '0xe397a72377F43645Cd4DA02d709c378df6e9eE5a',
  0.1545365,
  1545,
  'CREATED',
  'The OG meme coin reimagined on Core blockchain. Much wow, very fast!',
  'https://dogecore.fun',
  'https://twitter.com/dogecoin',
  'https://t.me/dogecore',
  'https://i.imgur.com/H37kxPH.jpg',
  '1000000000000000000000000',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (address) DO NOTHING;