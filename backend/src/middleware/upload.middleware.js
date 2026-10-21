import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure storage with safe, collision-resistant random UUID filenames
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = /^[a-z0-9.]+$/.test(ext) ? ext : "";
        const uniqueName = `${crypto.randomUUID()}${safeExt}`;
        cb(null, uniqueName);
    }
});

// Preliminary extension check (defense in depth)
const allowedExtensions = new Set([
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".mp3",
    ".wav"
]);

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
        return cb(new Error("Unsupported file extension. Allowed: PDF, JPEG, PNG, WEBP, MP3, WAV"));
    }
    cb(null, true);
};

export const upload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25 MB max limit
    },
    fileFilter
});

/**
 * Express middleware wrapper that catches Multer-specific errors (e.g. size limits)
 * and formats them into clean JSON error responses instead of unhandled exceptions.
 */
export const handleSingleUpload = (fieldName) => {
    const uploadSingle = upload.single(fieldName);

    return (req, res, next) => {
        uploadSingle(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({
                        message: "File size exceeds the 25MB limit"
                    });
                }
                return res.status(400).json({
                    message: `Upload error: ${err.message}`
                });
            } else if (err) {
                return res.status(400).json({
                    message: err.message || "File upload failed"
                });
            }
            next();
        });
    };
};

/**
 * Inspects the initial bytes (magic numbers) of the file on disk to determine its genuine MIME type.
 * Returns the verified MIME type string, or null if unrecognized / unsupported.
 */
export const detectFileType = async (filePath) => {
    let fileHandle;
    try {
        fileHandle = await fs.promises.open(filePath, "r");
        const buffer = Buffer.alloc(16);
        const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);

        if (bytesRead < 4) {
            return null;
        }

        // PDF: %PDF (0x25 0x50 0x44 0x46)
        if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
            return "application/pdf";
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4E &&
            buffer[3] === 0x47
        ) {
            return "image/png";
        }

        // JPEG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return "image/jpeg";
        }

        // WEBP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
        if (
            buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WEBP"
        ) {
            return "image/webp";
        }

        // WAV: RIFF (bytes 0-3) and WAVE (bytes 8-11)
        if (
            buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WAVE"
        ) {
            return "audio/wav";
        }

        // MP3 with ID3 tag: "ID3" (bytes 0-2)
        if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
            return "audio/mpeg";
        }

        // MP3 raw sync word: FF FB, FF F3, or FF F2
        if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
            return "audio/mpeg";
        }

        return null;
    } catch (error) {
        console.error("Error reading magic bytes:", error);
        return null;
    } finally {
        if (fileHandle) {
            await fileHandle.close();
        }
    }
};
