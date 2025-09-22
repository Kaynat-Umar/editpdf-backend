// server.js — clean date-fixed version
const express = require("express");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// serve frontend
app.use(express.static(path.join(__dirname, "public")));

// memory storage
const upload = multer({ storage: multer.memoryStorage() });

// /edit-metadata endpoint
app.post("/edit-metadata", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No PDF uploaded");

    const pdfDoc = await PDFDocument.load(req.file.buffer);

    const { title, author, subject, keywords, creationDate, modificationDate } = req.body;

    if (title) pdfDoc.setTitle(title);
    if (author) pdfDoc.setAuthor(author);
    if (subject) pdfDoc.setSubject(subject);
    if (keywords) {
      const arr = keywords.split(",").map(s => s.trim()).filter(Boolean);
      if (arr.length) pdfDoc.setKeywords(arr);
    }

    // parse dates from frontend
    if (creationDate) {
      const d = new Date(creationDate);
      if (!isNaN(d.getTime())) pdfDoc.setCreationDate(d);
    }
    if (modificationDate) {
      const d = new Date(modificationDate);
      if (!isNaN(d.getTime())) pdfDoc.setModificationDate(d);
    }

    // save updated PDF
    const editedBytes = await pdfDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from(editedBytes));
  } catch (err) {
    console.error("Error in /edit-metadata:", err);
    res.status(500).send("Server error while editing PDF.");
  }
});

// root serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
