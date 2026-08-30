# -*- coding: utf-8 -*-
import json,random,os,time,math
from pathlib import Path
random.seed(42)
t0=time.time()
SCALE=1_000_000
RTP=0.90

# Standard gifts with prices
STANDARD_GIFTS = [
    ("heart_15", "Heart", 15, "standard-gifts/heart_15.png"),
    ("bear_15", "Teddy Bear", 15, "standard-gifts/bear_15.png"),
    ("gift_25", "Gift Box", 25, "standard-gifts/gift_25.png"),
    ("rose_25", "Red Rose", 25, "standard-gifts/rose_25.png"),
    ("cake_50", "Birthday Cake", 50, "standard-gifts/cake_50.png"),
    ("bouquet_50", "Bouquet", 50, "standard-gifts/bouquet_50.png"),
    ("rocket_50", "Rocket", 50, "standard-gifts/rocket_50.png"),
    ("champagne_50", "Champagne", 50, "standard-gifts/champagne_50.png"),
    ("trophy_100", "Trophy", 100, "standard-gifts/trophy_100.png"),
    ("ring_100", "Diamond Ring", 100, "standard-gifts/ring_100.png"),
    ("diamond_100", "Diamond", 100, "standard-gifts/diamond_100.png"),
]

# Load prices
prices=json.load(open("giftsPrices.json"))

# Load NFT assets
nft_dir=Path("TelegramGiftsAssests-main/webp/by_name")
nfts=[]
for f in nft_dir.glob("*.webp"):
    slug=f.stem
    if slug in prices:
        nfts.append((slug,prices[slug],f"TelegramGiftsAssests-main/webp/by_name/{slug}.webp"))

nfts.sort(key=lambda x:x[1])
print(f"Loaded {len(nfts)} NFTs + {len(STANDARD_GIFTS)} standard gifts")

CASES=[("case_19","sumercase","basic",19),("case_49","newyearcase","basic",39),("case_99","toxiccase","basic",79),("case_199","oceancase","basic",149),("case_399","pashacase","medium",299),("case_799","daycase","medium",399),("case_1249","halouincase","medium",499),("case_1999","lovecase","medium",599),("case_2999","gemcase","elite",999),("case_4999","forestcase","elite",1499),("case_9999","hellcase","elite",2999),("case_19999","pokercase","elite",3999)]
def classify(p,cp):r=p/cp;return "common"if r<0.3 else "uncommon"if r<0.7 else "rare"if r<1.5 else "epic"if r<3.0 else "legendary"if r<7.0 else "jackpot"
def select(p,tier):
 n=45;items=[]
 if tier=="basic":
  items=random.sample(STANDARD_GIFTS,min(20,len(STANDARD_GIFTS)))
  nft_min=10
 elif tier=="medium":
  items=random.sample(STANDARD_GIFTS,min(10,len(STANDARD_GIFTS)))
  nft_min=25
 else:
  items=random.sample(STANDARD_GIFTS,min(5,len(STANDARD_GIFTS)))
  nft_min=35
