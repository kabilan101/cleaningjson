import json
import subprocess
import os

PRODUCTS_FILE = "products.txt"
OUTPUT_FILE = "iga-product.json"


def load_terms(path):
    with open(path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def run_term(term):
    # Write single term to products.txt
    with open(PRODUCTS_FILE, "w", encoding="utf-8") as f:
        f.write(term + "\n")

    # Run the Node script (it will read products.txt and append to iga-product.json)
    cmd = ["node", "igaSingpleProduct.js"]
    print(f"Running: {' '.join(cmd)} for term '{term}'")
    print("Chromium window should open. Kill with Ctrl+C if needed.")
    try:
        proc = subprocess.run(cmd, check=True)
        print(f"Completed term: {term}")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] term={term} failed: {e}")
        return False
    except KeyboardInterrupt:
        print(f"[INTERRUPTED] term={term}")
        return False
    return True


if __name__ == "__main__":
    terms = load_terms(PRODUCTS_FILE)
    for term in terms:
        print(f"---\nProcessing term: {term}")
        run_term(term)
