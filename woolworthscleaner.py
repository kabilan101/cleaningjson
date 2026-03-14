import json

path = "ww.json"

with open(path, "r", encoding="utf-8") as f:
    items = json.load(f)

before = len(items)
seen = set()
deduped = []

for item in items:
    key = item.get("productId") or item.get("url")
    if key and key not in seen:
        seen.add(key)
        deduped.append(item)

after = len(deduped)

with open(path, "w", encoding="utf-8") as f:
    json.dump(deduped, f, indent=2, ensure_ascii=False)

print(f"Before: {before} | After: {after} | Removed: {before - after}")