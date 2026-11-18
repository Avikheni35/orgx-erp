import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const UPLOAD_DIR = path.join(__dirname, '../../uploads/attachments');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAGIC: Record<string, number[]> = {
  'image/jpeg':       [0xFF, 0xD8, 0xFF],
  'image/png':        [0x89, 0x50, 0x4E, 0x47],
  'image/webp':       [0x52, 0x49, 0x46, 0x46],
  'application/pdf':  [0x25, 0x50, 0x44, 0x46],
  'application/msword': [0xD0, 0xCF, 0x11, 0xE0],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04],
};

function matchesMagic(filePath: string, mime: string): boolean {
  const sig = MAGIC[mime];
  if (!sig) return false;
  const buf = Buffer.alloc(sig.length);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, sig.length, 0);
  fs.closeSync(fd);
  return sig.every((byte, i) => buf[i] === byte);
}

// Use fully random filename — never preserve the original name
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const multerUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, JPEG, PNG, WebP, DOC, DOCX'));
  },
}).single('file');

export function uploadAttachment(req: Request, res: Response, next: NextFunction) {
  multerUpload(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next();
    if (!matchesMagic(req.file.path, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Ungültiger Dateityp — Dateiinhalt stimmt nicht überein.' });
    }
    next();
  });
}
