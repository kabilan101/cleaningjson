import json

input_file = "collection.json"
output_file = "collection.ndjson"

with open(input_file, "r", encoding="utf-8") as f:
    items = json.load(f)

with open(output_file, "w", encoding="utf-8") as f:
    for item in items:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

print(f"Converted {len(items)} items to {output_file}")
