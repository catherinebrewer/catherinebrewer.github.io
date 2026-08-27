#!/usr/bin/env python3
"""
Generate display-sized WebP thumbnails for the vibes wall.

index.html scales every image down to roughly 500x300 before showing it, but the
browser still downloads the full-resolution original. This writes a thumbnail at
2x the displayed size (sharp on retina) into thumbs/, named "<original>.webp".
index.html tries the thumbnail first and falls back to the original on 404, so
images without a thumbnail (animated GIFs, anything already small enough) just
work.

Run it after adding new images (and after re-running lister.py):
    python3 make_thumbs.py            # only new/changed images
    python3 make_thumbs.py --force    # redo everything
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
THUMB_DIR = os.path.join(HERE, "thumbs")
SCALE = 2          # retina factor
QUALITY = 82
FORCE = "--force" in sys.argv


def displayed_size(w, h):
    """Mirror the goal_pixels logic in index.html."""
    goal_pixels = 500 * 300
    ratio = (w * h) / goal_pixels
    div = 8 if ratio > 16 else (4 if ratio > 4 else 2)
    return w // div, h // div


def is_animated(path):
    try:
        with Image.open(path) as im:
            return getattr(im, "n_frames", 1) > 1
    except Exception:
        return False


def main():
    with open(os.path.join(HERE, "image_widths_heights.json")) as f:
        data = json.load(f)

    os.makedirs(THUMB_DIR, exist_ok=True)
    before = after = 0
    made = skipped = missing = 0
    kept_original = []

    for name, (w, h) in data:
        src = os.path.join(HERE, name)
        if not os.path.exists(src):
            print(f"  MISSING (listed in json, not on disk): {name}")
            missing += 1
            continue

        orig_bytes = os.path.getsize(src)
        out = os.path.join(THUMB_DIR, name + ".webp")

        if is_animated(src):
            print(f"  animated, left alone: {name}")
            kept_original.append(name)
            before += orig_bytes
            after += orig_bytes
            continue

        if os.path.exists(out) and not FORCE and os.path.getmtime(out) >= os.path.getmtime(src):
            before += orig_bytes
            after += os.path.getsize(out)
            skipped += 1
            continue

        dw, dh = displayed_size(w, h)
        tw, th = min(w, dw * SCALE), min(h, dh * SCALE)

        with Image.open(src) as im:
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            im.thumbnail((tw, th), Image.LANCZOS)
            im.save(out, "WEBP", quality=QUALITY, method=6)

        new_bytes = os.path.getsize(out)
        if new_bytes >= orig_bytes:
            # no win -- drop the thumbnail and let index.html fall back
            os.remove(out)
            kept_original.append(name)
            before += orig_bytes
            after += orig_bytes
            continue

        before += orig_bytes
        after += new_bytes
        made += 1

    print(f"\nthumbnails written: {made}   up to date: {skipped}   "
          f"served as original: {len(kept_original)}   missing: {missing}")
    if kept_original:
        print("  originals kept: " + ", ".join(kept_original))
    if before:
        print(f"page weight: {before/1e6:.1f} MB -> {after/1e6:.1f} MB "
              f"({100*(1-after/before):.0f}% smaller)")


if __name__ == "__main__":
    main()
