#!/usr/bin/env python3
"""
Analyze a Kleinanzeigen image via OpenRouter vision API.
Fetches the XXL image, sends to Gemini 2.0 Flash Vision, returns description.

Usage:
    python3 analyze_image.py <image_url> [prompt]

Examples:
    python3 analyze_image.py "https://img.kleinanzeigen.de/api/v1/prod-ads/images/a9/xxx?rule=$_57.AUTO"
    python3 analyze_image.py <image_url> "Is this a real bike photo? Answer YES/NO and why."
"""

import sys, urllib.request, base64, json, os

API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
if not API_KEY:
    # Try to load from auth profiles
    try:
        with open("/home/node/.openclaw/agents/main/agent/auth-profiles.json") as f:
            profiles = json.load(f).get("profiles", {})
            API_KEY = profiles.get("openrouter:default", {}).get("key", "")
    except:
        pass

DEFAULT_PROMPT = "Describe what you see. Is it a real product photo or a stock image? What item? Good quality? Under 300 chars."

def analyze_image(url: str, prompt: str = DEFAULT_PROMPT) -> str:
    if not API_KEY:
        return "ERROR: No API key found"

    # Download the image
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "okhttp/4.10.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            img_data = r.read()
            content_type = r.headers.get("content-type", "image/jpeg")
    except Exception as e:
        return f"ERROR: Failed to fetch image: {e}"

    if len(img_data) < 1000:
        return f"ERROR: Image too small ({len(img_data)} bytes)"

    # Base64 encode
    b64 = base64.b64encode(img_data).decode()

    # Call OpenRouter
    payload = {
        "model": "google/gemini-2.0-flash-001",
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}}
        ]}]
    }

    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
            return resp["choices"][0]["message"]["content"]
    except Exception as e:
        return f"ERROR: API call failed: {e}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: analyze_image.py <image_url> [prompt]")
        sys.exit(1)

    url = sys.argv[1]
    prompt = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PROMPT

    result = analyze_image(url, prompt)
    print(result)
