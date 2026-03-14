import json

# Load the JSON data from the file
with open('iga.json', 'r') as file:
    data = json.load(file)

# Process each item in the list
for item in data:
    # Add store_name
    item['store_name'] = 'IGA'
    # Rename title to product_name
    if 'title' in item:
        item['product_name'] = item.pop('title')

# Write the modified data back to the file
with open('iga.json', 'w') as file:
    json.dump(data, file, indent=2)

print("Processing complete. Modified iga.json with store_name and renamed title to product_name.")