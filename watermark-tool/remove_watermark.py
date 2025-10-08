# remove_watermark.py
# usage: python remove_watermark.py input.pdf output.pdf

import sys
import os
try:
    import fitz  # PyMuPDF
    import cv2
    import numpy as np
except Exception as e:
    print("PY_DEP_ERROR", str(e))
    sys.exit(2)

def remove_watermark(input_pdf, output_pdf):
    try:
        doc = fitz.open(input_pdf)
        for page_index in range(len(doc)):
            page = doc[page_index]

            # Remove images that look like watermarks by heuristics:
            # - large images covering most of the page
            # - semi-transparent / pale images (best-effort)
            imgs = page.get_images(full=True)
            for img in imgs:
                xref = img[0]
                w = img[2]
                h = img[3]
                # if image covers significant area, remove it (heuristic)
                mediabox = page.mediabox
                page_w = mediabox.width
                page_h = mediabox.height
                area_ratio = (w * h) / (page_w * page_h)
                if area_ratio > 0.08:  # adjustable
                    try:
                        page.delete_image(xref)
                    except:
                        pass

            # OPTIONAL: remove obvious large faint text blocks (watermark text)
            # We'll detect very large font-size spans and redact them
            blocks = page.get_text("dict")["blocks"]
            for b in blocks:
                if "lines" in b:
                    for l in b["lines"]:
                        for s in l["spans"]:
                            size = s.get("size", 0)
                            color = s.get("color", None)
                            text = s.get("text", "").strip()
                            # heuristics: large font + short repeated text often watermark
                            if size >= 40 and len(text) > 0 and len(text) < 200:
                                try:
                                    page.add_redact_annot(s["bbox"])
                                except:
                                    pass
            try:
                page.apply_redactions()
            except:
                pass

        doc.save(output_pdf)
        print("SAVED", output_pdf)
    except Exception as e:
        print("ERROR", str(e))
        # write to stderr too
        raise

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("USAGE: remove_watermark.py input.pdf output.pdf")
        sys.exit(1)
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    remove_watermark(input_pdf, output_pdf)
