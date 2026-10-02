# Document generators

Scripts that build the architecture and workflow PDFs in `docs/`. Everything
here is source; the PDFs, SVGs and PNGs under `docs/` are generated output.

## Requirements

- Python 3. The PDF and SVG generators use the standard library only.
  `design_docx.py` needs **python-docx**, and `verify_pdf.py` needs **PyMuPDF**.
- Google Chrome, or Microsoft Edge. Chrome renders the SVG and prints the PDF.
  `paths.py` finds it automatically; override with the `CHROME` env var.

No pandoc, WeasyPrint or LaTeX is used or needed.

## What builds what

| Run | Produces |
| :-- | :-- |
| `python tools/docs/hero.py` | `docs/diagrams/01-buildflow-workflow-overview.svg` |
| `python tools/docs/flows.py` | `docs/diagrams/02…08-*.svg` — the 7 step flows |
| `python tools/docs/export.py` | a 2× PNG beside every SVG, then `docs/buildflow-workflows.pdf` (9 pp, A4 landscape) |
| `python tools/docs/build.py` | `docs/buildflow-architecture.pdf` (11 pp, A4 landscape) |
| `python tools/docs/design_pdf.py` | `docs/buildflow-technical-design.pdf` (10 pp, A4 landscape) |
| `python tools/docs/design_docx.py` | `docs/buildflow-technical-design.docx` (10 pp, editable) |
| `python tools/docs/design_pdf.py roadmap_content` | `docs/buildflow-product-roadmap.pdf` (10 pp) |
| `python tools/docs/design_docx.py roadmap_content` | `docs/buildflow-product-roadmap.docx` (10 pp, editable) |

`export.py` reads whatever SVGs are already in `docs/diagrams/`, so run
`hero.py` and `flows.py` before it. Full rebuild:

```bash
python tools/docs/hero.py && python tools/docs/flows.py && python tools/docs/export.py && python tools/docs/build.py && python tools/docs/design_pdf.py && python tools/docs/design_docx.py && python tools/docs/design_pdf.py roadmap_content && python tools/docs/design_docx.py roadmap_content
```

## Documents built from a content module

`design_pdf.py` and `design_docx.py` are renderers, not documents. Each takes a
content module and builds the file that module names in its `OUT_STEM`:

| Content module | Builds |
| :-- | :-- |
| `design_content.py` *(the default)* | the technical design document |
| `roadmap_content.py` | the product feature roadmap |

A content module holds text and structure and no formatting, so a document's
two formats cannot drift. To add a third document, write another content
module in the same shape — `OUT_STEM`, `DOC_TITLE`, `FOOTER`, `COVER`, `PAGES`.

### The technical design document

`buildflow-technical-design.pdf` and `.docx` are the same document in two
formats. It is written as a **pre-implementation blueprint**: every statement
says what the architecture defines and what will be built, never what exists.
Keep that tense when editing — "the module will own", not "the module owns".

To change it, edit `design_content.py` and re-run both renderers. `design_pdf.py`
owns the print CSS; `design_docx.py` owns the Word styling.

### The product feature roadmap

`buildflow-product-roadmap.pdf` and `.docx` separate the MVP from the later
releases. Every line in `roadmap_content.py` is traceable to a decision already
written down — `docs/03_mvp_definition.md` for the MVP scope, its exclusions and
its gates, `docs/05_roadmap.md` for the release phases and the risk register, and
`plans.md` for the one recorded scope change. Do not add a feature to this
document that is not decided somewhere else first; if a source says something
different, change the source, then regenerate.

Its diagrams live in `roadmap_diagrams.py` and reuse `diagrams.py` for the box
style and the palette.

### Two things in `design_docx.py` are easy to break

- **Element order.** Word rejects the file as corrupt if a raw element is
  appended to `pPr`, `rPr`, `tcPr` or `tblPr` out of schema order. Always add
  them through `put()`, which inserts at the right position.
- **Container widths.** Every block renderer takes a `width_mm`. Inside a
  two-column block that is the column width, not the page width. A block that
  assumes the page width will overflow its column.

The 23-page reference is a hand-written page rather than a generator. Its source
is `modular-monolith-architecture.html`; render it with:

```bash
python -c "import sys,subprocess,os; sys.path.insert(0,'tools/docs'); from paths import DOCS,chrome,PDF_FLAGS,url; subprocess.run([chrome()]+PDF_FLAGS+['--print-to-pdf='+os.path.join(DOCS,'modular-monolith-architecture.pdf'),url('tools/docs/modular-monolith-architecture.html')])"
```

## Files

| File | Role |
| :-- | :-- |
| `paths.py` | Repo-relative paths, Chrome discovery, shared Chrome flags |
| `diagrams.py` | SVG diagram library (`d1`–`d6`, `box`, `svg`, palette `K`) |
| `build.py` | Page content and CSS for the 11-page reference |
| `design_content.py` | Text and structure of the technical design document |
| `roadmap_content.py` | Text and structure of the product feature roadmap |
| `roadmap_diagrams.py` | SVG diagrams for the roadmap (`r1`–`r3`) |
| `design_pdf.py` | Any content module → PDF |
| `design_docx.py` | Any content module → editable DOCX |
| `verify_pdf.py` | QA helper that reads a finished PDF, see below |
| `hero.py` | The four-stage CAPTURE → REVIEW → SETTLE → DECIDE diagram |
| `flows.py` | Step-flow engine: one geometry pass, so every flow aligns identically |
| `export.py` | SVG → 2× PNG, and the combined workflow PDF |
| `verify.py` | QA helper, see below |
| `modular-monolith-architecture.html` | Source of the 23-page reference |
| `.build/` | Intermediate HTML and QA screenshots. Gitignored. |

## Checking the result

Chrome cannot be asked to show you a PDF page, and this machine has no
poppler/`pdftoppm`, so a page that overflows its box fails **silently** — a
table simply loses its last rows. Every change should be eyeballed.

After `build.py`, render page ranges to PNG and look at them:

```bash
python tools/docs/verify.py 1-2,5-5,7-7
```

That writes `.build/v0.png`, `.build/v1.png`, … one image per range. It reads
`_doc.html` by default; pass a second argument for another build, for example
`python tools/docs/verify.py 1-3 _design.html`.

`verify_pdf.py` checks the finished PDF instead of its HTML source, which also
catches anything the print step changes:

```bash
python tools/docs/verify_pdf.py docs/buildflow-technical-design.pdf 1,7,10
```

It prints the page count and writes `.build/p1.png`, `p7.png`, `p10.png`.

The DOCX has no HTML source to inspect, so check it through Word itself — open
it, confirm the page count, and export a PDF to look at:

```powershell
$w = New-Object -ComObject Word.Application; $w.Visible = $false
$d = $w.Documents.Open("C:\path\to\buildflow-technical-design.docx", $false, $true)
$d.ComputeStatistics(2); $d.ExportAsFixedFormat("C:\path\to\preview.pdf", 17)
$d.Close($false); $w.Quit()
```

If `Documents.Open` reports the file is corrupted, an element went into the
wrong place in its parent — see the note above about `put()`.

Things that have gone wrong before, and are worth re-checking after any edit:

- **Tables running past the page.** Rows are dropped with no error. The module
  and contract tables on pages 3 and 7 are the tight ones.
- **Double-escaped `&`.** `box()` in `diagrams.py` does *not* escape its label,
  so callers pass `&amp;` themselves. Passing a bare `&` produces invalid XML;
  passing `&amp;` to something that also escapes prints `&amp;amp;`.
- **Arrows ending in empty space** after a box is moved. The paths are absolute
  coordinates, not anchored to the boxes.
- **Labels overlapping connector lines.**

## Footers

Chrome's default print header stamps the `file:///` URL and a date onto every
page. `--print-to-pdf-no-header` in `paths.PDF_FLAGS` suppresses it, and the
footer drawn by `build.py` carries only the document name and page number. Do
not remove that flag. To confirm a build is clean:

```bash
python -c "d=open('docs/buildflow-architecture.pdf','rb').read(); print([t for t in (b'file:///',b'AppData',b'scratchpad') if t in d] or 'clean')"
```

## Note on committing the output

`.gitignore` excludes `*.pdf`, so generated PDFs need `git add -f` if you want
them in the repo. The DOCX, SVGs and PNGs commit normally.
