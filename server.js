// server.js (CommonJS) - robust metadata editor with helpful logging
const express = require('express');
const multer = require('multer');
const { PDFDocument, PDFName } = require('pdf-lib');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Allow CORS+iframe on your site (adjust domain if needed)
app.use(cors());
app.use((req, res, next) => {
  // allow embedding on your site(s)
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://editpdfdata.com https://www.editpdfdata.com");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

// Serve static frontend from /public (if you put index.html there)
app.use(express.static(path.join(__dirname, 'public')));

// Multer memory storage (we don't persist files)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB cap

// Helper: convert JS Date -> PDF-style D:YYYYMMDDHHmmSSZ
function toPDFDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    'D:' +
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds()) +
    'Z'
  );
}

// Build minimal XMP packet (some readers use XMP metadata)
function escapeXml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
}
function buildXMP({ title, author, keywords, createISO, modifyISO }) {
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      ${title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>` : ''}
      ${author ? `<dc:creator><rdf:Seq><rdf:li>${escapeXml(author)}</rdf:li></rdf:Seq></dc:creator>` : ''}
      ${keywords ? `<dc:subject><rdf:Bag><rdf:li>${escapeXml(keywords)}</rdf:li></rdf:Bag></dc:subject>` : ''}
      ${createISO ? `<xmp:CreateDate>${escapeXml(createISO)}</xmp:CreateDate>` : ''}
      ${modifyISO ? `<xmp:ModifyDate>${escapeXml(modifyISO)}</xmp:ModifyDate>` : ''}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// Main endpoint: edit-metadata
app.post('/edit-metadata', upload.single('pdf'), async (req, res) => {
  try {
    console.log('POST /edit-metadata called. Body keys:', Object.keys(req.body || {}));
    if (!req.file) {
      console.warn('No file in request');
      return res.status(400).send('No PDF uploaded (field name: pdf).');
    }

    console.log('Uploaded file:', req.file.originalname, 'size:', req.file.size);

    // Load PDF (ignore encryption if any)
    const pdfDoc = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });

    // Extract input fields (ISO datetime strings expected from client)
    const { title, author, subject, keywords, creationDate, modificationDate } = req.body || {};

    // Apply high-level metadata setters if present
    if (typeof title !== 'undefined' && title !== '') {
      pdfDoc.setTitle(title);
    }
    if (typeof author !== 'undefined' && author !== '') {
      pdfDoc.setAuthor(author);
    }
    if (typeof subject !== 'undefined' && subject !== '') {
      pdfDoc.setSubject(subject);
    }
    if (typeof keywords !== 'undefined' && keywords !== '') {
      const arr = keywords.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) pdfDoc.setKeywords(arr);
    }

    // Dates: convert incoming ISO -> Date
    let createdDateObj = null;
    let modifiedDateObj = null;
    if (creationDate) {
      const d = new Date(creationDate);
      if (!isNaN(d.getTime())) {
        pdfDoc.setCreationDate(d);
        createdDateObj = d;
      } else console.warn('creationDate parse failed for', creationDate);
    }
    if (modificationDate) {
      const d = new Date(modificationDate);
      if (!isNaN(d.getTime())) {
        pdfDoc.setModificationDate(d);
        modifiedDateObj = d;
      } else console.warn('modificationDate parse failed for', modificationDate);
    }

    // Gentle page-touch (some viewers refresh metadata only if file content changed)
    try {
      const pages = pdfDoc.getPages();
      if (pages.length) pages[0].drawText(' ', { x: 1, y: 1, size: 0.1 });
    } catch (e) {
      console.warn('page touch failed (non-fatal):', e.message || e);
    }

    // Best-effort: attach Info dictionary entries (PDF Info) & XMP metadata
    try {
      const infoObj = {};
      if (title) infoObj.Title = title;
      if (author) infoObj.Author = author;
      if (subject) infoObj.Subject = subject;
      if (keywords) infoObj.Keywords = keywords;
      if (createdDateObj) infoObj.CreationDate = toPDFDate(createdDateObj);
      if (modifiedDateObj) infoObj.ModDate = toPDFDate(modifiedDateObj);

      // register info object as an indirect object if we created any entries
      if (Object.keys(infoObj).length) {
        const pdfContext = pdfDoc.context;
        const infoRef = pdfContext.register(pdfContext.obj(infoObj));
        // Many readers read the trailer Info or XMP. We'll try to set Info (best-effort)
        try {
          // try to set trailer.Info - wrap in try/catch because internals differ across pdf-lib versions
          if (pdfContext && pdfContext.trailer && typeof pdfContext.trailer.set === 'function') {
            pdfContext.trailer.set(pdfContext.obj({ Info: infoRef }));
          } else {
            // fallback: attach Info into the catalog as a named entry (some viewers still read)
            try {
              pdfDoc.catalog.set(PDFName.of('Info'), infoRef);
            } catch (e2) {
              console.warn('Fallback Info attach failed (non-fatal):', e2.message || e2);
            }
          }
        } catch (innerErr) {
          console.warn('Unable to set Info dictionary (non-fatal):', innerErr.message || innerErr);
        }
      }

      // Create XMP metadata packet (ISO timestamps) — helpful for Adobe/Preview
      const createISO = createdDateObj ? createdDateObj.toISOString() : null;
      const modifyISO = modifiedDateObj ? modifiedDateObj.toISOString() : null;
      const xmp = buildXMP({ title: title || '', author: author || '', keywords: keywords || '', createISO, modifyISO });
      try {
        const bytes = Buffer.from(xmp, 'utf8');
        const pdfContext = pdfDoc.context;
        // flateStream exists in many pdf-lib versions; fallback to stream()
        const metadataStream = pdfContext.flateStream ? pdfContext.flateStream(bytes) : pdfContext.stream(bytes);
        const metadataRef = pdfContext.register(metadataStream);
        try {
          pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);
        } catch (e) {
          console.warn('Unable to set Metadata in catalog (non-fatal):', e.message || e);
        }
      } catch (e) {
        console.warn('XMP injection failed (non-fatal):', e.message || e);
      }
    } catch (errInfo) {
      console.warn('Info/XMP building failed (non-fatal):', errInfo.message || errInfo);
    }

    // Save edited PDF
    const editedBytes = await pdfDoc.save();

    // Send back PDF bytes (force download by Content-Disposition)
    const fileNameSafe = `edited-${(req.file.originalname || 'file.pdf').replace(/[^a-zA-Z0-9.\-_ ]/g, '_')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileNameSafe}"`);
    res.send(Buffer.from(editedBytes));
    console.log('Edited PDF returned successfully for', req.file.originalname);
  } catch (err) {
    console.error('Error in /edit-metadata:', err && err.stack ? err.stack : err);
    // return error text (helps client debug). In production you may want to hide details.
    res.status(500).send('Server error while editing PDF. ' + (err && err.message ? err.message : ''));
  }
});

// Serve root index if present
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT} (pid ${process.pid})`));
