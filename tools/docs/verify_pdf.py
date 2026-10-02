"""QA helper: render pages of a built PDF to PNG, and report the page count.

    python verify_pdf.py docs/buildflow-technical-design.pdf          -> count only
    python verify_pdf.py docs/buildflow-technical-design.pdf 1,4,10   -> .build/p1.png, ...

This reads the finished PDF rather than its HTML source, so it catches anything
the print step itself changes. Page numbers are 1-based.
"""
import os
import sys

import pymupdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUILD   # noqa: E402

path = sys.argv[1]
doc = pymupdf.open(path)
print("%s: %d pages" % (os.path.basename(path), doc.page_count))

if len(sys.argv) > 2:
    for n in (int(x) for x in sys.argv[2].split(",")):
        out = os.path.join(BUILD, "p%d.png" % n)
        doc[n - 1].get_pixmap(dpi=110).save(out)
        print("rendered page", n, "->", out)
