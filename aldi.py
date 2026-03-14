import json
import re

def title_from_url(url):
    slug = url.split("/product/")[-1] if "/product/" in url else ""
    # Remove trailing numeric ID (9+ digits)
    without_id = re.sub(r"-\d{9,}[^-]*$", "", slug)
    lower_words = {"g", "kg", "ml", "l", "m", "x", "pk", "pk", "and"}
    words = without_id.split("-")
    return " ".join(
        w if w in lower_words else w.capitalize()
        for w in words
    )

path = "aldi.json"

with open(path, "r", encoding="utf-8") as f:
    items = json.load(f)

fixed = 0
for item in items:
    if not item.get("title") and item.get("url"):
        item["title"] = title_from_url(item["url"])
        fixed += 1

with open(path, "w", encoding="utf-8") as f:
    json.dump(items, f, indent=2, ensure_ascii=False)

print(f"Fixed {fixed} titles. Total: {len(items)} items.")