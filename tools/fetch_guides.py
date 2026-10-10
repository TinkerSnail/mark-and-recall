#!/usr/bin/env python3
"""Download the two guides' verbatim text into source/.

GameFAQs blocks scripted downloads, so this pulls pinned Wayback Machine
snapshots of the guide pages and pulls the text out of their <pre> blocks.
The text stays out of git: Karpah's guide is personal-use only.
"""

import gzip
import html
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = "https://gamefaqs.gamespot.com/pc/913818-the-elder-scrolls-iii-morrowind/faqs"
GUIDES = {
    # out file: (GameFAQs id, Wayback snapshot timestamp)
    "tarvis79.txt": (71172, "20250122153738"),
    "karpah.txt": (33672, "20250821144124"),
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "guide-lab/1.0 (personal use)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if data[:2] == b"\x1f\x8b":  # Wayback serves the original gzip bytes for id_ captures
        data = gzip.decompress(data)
    return data.decode("utf-8", errors="replace")


def main():
    os.makedirs(os.path.join(ROOT, "source"), exist_ok=True)
    for name, (gid, ts) in GUIDES.items():
        page = fetch(f"https://web.archive.org/web/{ts}id_/{GAME}/{gid}")
        pre = re.findall(r"<pre[^>]*>(.*?)</pre>", page, re.S)
        text = "\n".join(html.unescape(re.sub(r"<[^>]+>", "", p)) for p in pre)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        if len(text) < 100_000:
            raise SystemExit(f"{name}: only {len(text)} chars came back; the snapshot may have moved")
        with open(os.path.join(ROOT, "source", name), "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"{name}: {len(text):,} chars")


if __name__ == "__main__":
    main()
