"""
Comparison table: OLD vs NEW distribution
"""
import json

# OLD distribution data (from previous run)
old_data = [
    {'case': 1, 'price': 6, 'rtp': 90.08, 'hit_25': 100.00, 'hit_50': 93.30, 'hit_100': 28.30, 'top_chance': 0.4812},
    {'case': 2, 'price': 8, 'rtp': 89.97, 'hit_25': 100.00, 'hit_50': 58.56, 'hit_100': 30.48, 'top_chance': 0.6488},
    {'case': 3, 'price': 10, 'rtp': 90.09, 'hit_25': 100.00, 'hit_50': 56.11, 'hit_100': 34.06, 'top_chance': 0.8399},
    {'case': 4, 'price': 15, 'rtp': 89.97, 'hit_25': 76.62, 'hit_50': 51.99, 'hit_100': 30.94, 'top_chance': 0.8138},
    {'case': 5, 'price': 20, 'rtp': 90.09, 'hit_25': 63.09, 'hit_50': 55.90, 'hit_100': 41.16, 'top_chance': 0.8547},
    {'case': 6, 'price': 30, 'rtp': 90.09, 'hit_25': 54.99, 'hit_50': 52.46, 'hit_100': 43.65, 'top_chance': 1.0078},
    {'case': 7, 'price': 45, 'rtp': 90.09, 'hit_25': 61.91, 'hit_50': 58.24, 'hit_100': 42.71, 'top_chance': 1.4908},
    {'case': 8, 'price': 60, 'rtp': 90.10, 'hit_25': 59.15, 'hit_50': 57.97, 'hit_100': 42.07, 'top_chance': 1.8972},
    {'case': 9, 'price': 80, 'rtp': 90.09, 'hit_25': 60.35, 'hit_50': 58.00, 'hit_100': 45.67, 'top_chance': 1.9309},
    {'case': 10, 'price': 110, 'rtp': 90.10, 'hit_25': 57.39, 'hit_50': 56.83, 'hit_100': 49.44, 'top_chance': 4.7055},
    {'case': 11, 'price': 125, 'rtp': 90.07, 'hit_25': 53.90, 'hit_50': 53.57, 'hit_100': 48.26, 'top_chance': 8.3608},
    {'case': 12, 'price': 200, 'rtp': 90.10, 'hit_25': 46.86, 'hit_50': 46.39, 'hit_100': 29.55, 'top_chance': 9.5931},
]

# NEW distribution data (from current run - FINAL)
new_data = [
    {'case': 1, 'price': 6, 'rtp': 90.09, 'hit_25': 100.00, 'hit_50': 98.92, 'hit_75': 73.36, 'hit_100': 34.82, 'top_chance': 0.0466},
    {'case': 2, 'price': 8, 'rtp': 90.07, 'hit_25': 100.00, 'hit_50': 93.97, 'hit_75': 68.80, 'hit_100': 28.46, 'top_chance': 0.0595},
    {'case': 3, 'price': 10, 'rtp': 89.92, 'hit_25': 100.00, 'hit_50': 91.65, 'hit_75': 60.74, 'hit_100': 30.01, 'top_chance': 0.0435},
    {'case': 4, 'price': 15, 'rtp': 90.09, 'hit_25': 98.29, 'hit_50': 89.17, 'hit_75': 53.29, 'hit_100': 26.22, 'top_chance': 0.0658},
    {'case': 5, 'price': 20, 'rtp': 89.91, 'hit_25': 97.67, 'hit_50': 85.23, 'hit_75': 50.55, 'hit_100': 44.52, 'top_chance': 0.0512},
    {'case': 6, 'price': 30, 'rtp': 90.06, 'hit_25': 97.40, 'hit_50': 83.48, 'hit_75': 61.54, 'hit_100': 35.03, 'top_chance': 0.0310},
    {'case': 7, 'price': 45, 'rtp': 90.00, 'hit_25': 97.65, 'hit_50': 85.08, 'hit_75': 47.95, 'hit_100': 26.97, 'top_chance': 0.0355},
    {'case': 8, 'price': 60, 'rtp': 89.97, 'hit_25': 95.25, 'hit_50': 84.37, 'hit_75': 50.84, 'hit_100': 19.86, 'top_chance': 0.0713},
    {'case': 9, 'price': 80, 'rtp': 90.07, 'hit_25': 89.32, 'hit_50': 77.09, 'hit_75': 46.76, 'hit_100': 29.91, 'top_chance': 0.1309},
    {'case': 10, 'price': 110, 'rtp': 89.91, 'hit_25': 86.09, 'hit_50': 74.36, 'hit_75': 58.12, 'hit_100': 19.75, 'top_chance': 0.1970},
    {'case': 11, 'price': 125, 'rtp': 89.91, 'hit_25': 84.83, 'hit_50': 73.27, 'hit_75': 62.49, 'hit_100': 23.50, 'top_chance': 0.2098},
    {'case': 12, 'price': 200, 'rtp': 89.98, 'hit_25': 84.58, 'hit_50': 73.84, 'hit_75': 43.87, 'hit_100': 15.27, 'top_chance': 0.6356},
]

print("="*180)
print("COMPARISON TABLE: OLD vs NEW DISTRIBUTION")
print("="*180)
print(f"{'CASE':<6} {'PRICE':<8} {'OLD RTP':<10} {'NEW RTP':<10} {'OLD >=50%':<12} {'NEW >=50%':<12} {'OLD >=100%':<12} {'NEW >=100%':<12} {'OLD TOP':<12} {'NEW TOP':<12} {'CHANGE':<10}")
print("="*180)

for old, new in zip(old_data, new_data):
    rtp_change = new['rtp'] - old['rtp']
    hit50_change = new['hit_50'] - old['hit_50']
    hit100_change = new['hit_100'] - old['hit_100']
    
    print(f"{old['case']:<6} {old['price']:<8} {old['rtp']:<9.2f}% {new['rtp']:<9.2f}% {old['hit_50']:<11.2f}% {new['hit_50']:<11.2f}% {old['hit_100']:<11.2f}% {new['hit_100']:<11.2f}% {old['top_chance']:<11.4f}% {new['top_chance']:<11.4f}% {hit100_change:>+9.2f}%")

print("="*180)
print("\nKEY IMPROVEMENTS:")
print("- Added MAX_RATIO constraint (NFT price <= case price * 150)")
print("- New category structure (A-H) based on ratio to case price")
print("- Favors items around case price (C, D, E categories)")
print("- Better distribution: higher chance for items >=75% of case price")
print("- Reduced jackpot chances to realistic levels")
print("- Added new metrics: P(win >= 75%, 150%, 200%, 500%, 1000%)")
