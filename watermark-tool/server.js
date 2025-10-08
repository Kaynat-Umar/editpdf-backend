// server.js - watermark tool (Node + runs python script)
// put this at: editpdf-backend/watermark-tool/server.js

const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5002;

// Allow embedding on your site
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://editpdfdata.com https://www.editpdfdata.com");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  next();
});

// Serve frontend from local public folder
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Ensure uploads/outputs exist
const UPLOADS = path.join(__dirname, 'uploads');
const OUTPUTS = path.join(__dirname, 'outputs');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(OUTPUTS)) fs.mkdirSync(OUTPUTS, { recursive: true });

// Multer disk storage (Ghostscript / Python script needs a real file)
const upload = multer({ dest: UPLOADS, limits: { fileSize: 50 * 1024 * 1024 } });

// POST /remove-watermark
app.post('/remove-watermark', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).send("No PDF uploaded (field name: pdf).");

  const inputPath = req.file.path;
  const outputName = `${Date.now()}-cleaned.pdf`;
  const outputPath = path.join(OUTPUTS, outputName);

  // Use configured python or fallback
  const pythonPath = process.env.PYTHON || process.env.PYTHON3 || 'python3' || 'python';

  // path to python script inside this folder
  const scriptPath = path.join(__dirname, 'remove_watermark.py');

  // build command
  const cmd = `"${pythonPath}" "${scriptPath}" "${inputPath}" "${outputPath}"`;

  console.log("🔹 Running:", cmd);

  exec(cmd, { windowsHide: true, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Python Error:", error.message);
      console.error("stderr:", stderr);
      // try to surface a helpful message
      return res.status(500).send("Failed to clean PDF (server). See logs.");
    }

    // send cleaned PDF
    res.download(outputPath, `cleaned-${req.file.originalname || 'file.pdf'}`, (err) => {
      // cleanup both files after sending
      try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch(e){}
      try { if (!err && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch(e){}
    });
  });
});

// serve watermark page directly
app.get('/', (req, res) => {
  const file = path.join(PUBLIC_DIR, 'watermark.html');
  if (!fs.existsSync(file)) return res.status(404).send("watermark.html not found");
  res.sendFile(file);
});

app.listen(PORT, () => {
  console.log(`✅ Watermark remover running at http://localhost:${PORT}`);
  console.log(`Server public folder path: ${PUBLIC_DIR}`);
});
