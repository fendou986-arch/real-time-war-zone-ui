from datetime import datetime, timezone
from urllib.request import Request, urlopen
from xml.etree import ElementTree
import json


FEEDS = [
    ("BBC", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("DW", "https://rss.dw.com/rdf/rss-en-world"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
]

articles = []
for domain, url in FEEDS:
    try:
        request = Request(url, headers={"User-Agent": "war-zone-dashboard/1.0"})
        root = ElementTree.fromstring(urlopen(request, timeout=20).read())
        for item in root.findall(".//item")[:5]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            date = (item.findtext("pubDate") or "").strip()
            if title and link:
                articles.append({
                    "title": title,
                    "url": link,
                    "domain": domain,
                    "seendate": date or datetime.now(timezone.utc).isoformat(),
                })
    except Exception:
        continue

if not articles:
    raise SystemExit("All RSS feeds unavailable")

with open("data/news.json", "w", encoding="utf-8") as output:
    json.dump(
        {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "rss",
            "stale": False,
            "articles": articles[:12],
        },
        output,
        ensure_ascii=False,
        indent=2,
    )
