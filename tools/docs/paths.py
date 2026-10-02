# -*- coding: utf-8 -*-
"""Shared paths for the docs generators.

Everything is derived from this file's location, so the scripts work from any
checkout and from any working directory. Intermediate HTML and QA screenshots
go to tools/docs/.build/, which is gitignored.
"""
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DOCS = os.path.join(REPO, "docs")
DIAGRAMS = os.path.join(DOCS, "diagrams")
BUILD = os.path.join(HERE, ".build")

os.makedirs(BUILD, exist_ok=True)


def chrome():
    """Headless Chrome used to rasterise SVG and print PDF.

    Override with the CHROME env var. Falls back to Edge, which takes the same
    flags, then to anything named chrome on PATH.
    """
    env = os.environ.get("CHROME")
    if env and os.path.exists(env):
        return env
    for c in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"):
        if os.path.exists(c):
            return c
    found = shutil.which("chrome") or shutil.which("google-chrome") or shutil.which("chromium")
    if found:
        return found
    raise SystemExit("No Chrome found. Set the CHROME env var to a Chrome or Edge binary.")


# Flags that suppress Chrome's own header/footer. Without
# --print-to-pdf-no-header the PDF carries the file:/// URL and a date stamp.
PDF_FLAGS = ["--headless=new", "--disable-gpu", "--no-sandbox",
             "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000",
             "--print-to-pdf-no-header"]

SHOT_FLAGS = ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars"]


def url(path):
    """Chrome needs an absolute file:/// URL with forward slashes."""
    return "file:///" + os.path.abspath(path).replace("\\", "/")
