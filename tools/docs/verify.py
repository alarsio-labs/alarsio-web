"""QA helper: render page ranges of a built doc to PNG for visual checking.

    python verify.py 1-2,5-5             -> .build/v0.png, v1.png  (from _doc.html)
    python verify.py 1-3 _design.html    -> the same, for another build
"""
import io, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import BUILD as HERE, chrome, SHOT_FLAGS, url
SRC = sys.argv[2] if len(sys.argv) > 2 else "_doc.html"
doc = io.open(os.path.join(HERE, SRC), encoding="utf-8").read()
head, body = doc.split("<body>")[0] + "<body>", doc.split("<body>")[1]
pages = re.findall(r'<section class="pg.*?</section>', body, re.S)
print("pages found:", len(pages))
groups = [(int(a), int(b)) for a, b in (g.split("-") for g in sys.argv[1].split(","))]
for gi, (a, b) in enumerate(groups):
    sub = "".join(pages[a-1:b])
    f = os.path.join(HERE, "_v%d.html" % gi)
    io.open(f, "w", encoding="utf-8").write(head + sub + "</body></html>")
    n = b - a + 1
    subprocess.run([chrome()] + SHOT_FLAGS + ["--window-size=1123,%d" % (794 * n),
                    "--screenshot=" + os.path.join(HERE, "v%d.png" % gi),
                    url(f)], capture_output=True)
    print("rendered pages", a, "-", b)
