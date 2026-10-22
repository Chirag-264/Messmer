import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage engine configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
});

// Allowed document MIME types
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp"
]);

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error(`Unsupported file type: ${file.mimetype}. Allowed types: PDF, TXT, MD, CSV, JSON, DOC, DOCX, Images`);
        error.code = "INVALID_FILE_TYPE";
        cb(error, false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25 MB limit
    }
});

/**
 * Express middleware wrapper to catch Multer errors gracefully.
 */
export const handleUploadSingle = (fieldName = "file") => {
    const uploader = upload.single(fieldName);

    return (req, res, next) => {
        uploader(req, res, (err) => {
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

// Alias for backwards-compatibility
export const handleSingleUpload = handleUploadSingle;

/**
 * Inspects the initial bytes (magic numbers) of the file on disk to determine its genuine MIME type.
 */
export const detectFileType = async (filePath) => {
    let fileHandle;
    try {
        fileHandle = await fs.promises.open(filePath, "r");
        const buffer = Buffer.alloc(16);
        const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);

        if (bytesRead < 4) return null;

        // PDF: %PDF (25 50 44 46)
        if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
            return "application/pdf";
        }
        // PNG: 89 50 4E 47
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return "image/png";
        }
        // JPEG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return "image/jpeg";
        }

        return null;
    } catch {
        return null;
    } finally {
        if (fileHandle) {
            await fileHandle.close().catch(() => {});
        }
    }
};
