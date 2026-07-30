"""Build the portable single-file compare.html from the split sources.

Inlines css/style.css, js/lib/*.js and js/app.js into index.html so the
result can be double-clicked or copied anywhere as one file.

Usage:  python scripts/build_single_file.py
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    return io.open(os.path.join(ROOT, *parts), encoding="utf-8").read()


def main():
    html = read("index.html")

    css = read("css", "style.css")
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n" + css + "</style>",
    )

    for src in re.findall(r'<script src="(js/[^"]+)"></script>', html):
        js = read(*src.split("/"))
        assert "</script" not in js, f"{src} contains </script>, cannot inline"
        html = html.replace(
            f'<script src="{src}"></script>',
            "<script>\n" + js + "\n</script>",
        )

    out = os.path.join(ROOT, "compare.html")
    io.open(out, "w", encoding="utf-8", newline="\n").write(html)
    print(f"wrote {out} ({os.path.getsize(out):,} bytes)")


if __name__ == "__main__":
    main()
