import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";
import { detectFileType } from "../middleware/upload.middleware.js";

/**
 * Middleware: Verify that the target workspace exists and belongs to the authenticated user.
 * Runs BEFORE Multer processes the upload stream to avoid writing files for invalid/unauthorized requests.
 */
export const verifyWorkspaceAccess = async (req, res, next) => {
    const { workspaceId } = req.params;

    if (!workspaceId) {
        return res.status(400).json({
            message: "Workspace ID is required"
        });
    }

    try {
        const workspace = await prisma.workspace.findFirst({
            where: {
                id: workspaceId,
                ownerId: req.user.userId
            }
        });

        if (!workspace) {
            return res.status(404).json({
                message: "Workspace not found"
            });
        }

        // Attach workspace to request for downstream handlers if needed
        req.workspace = workspace;
        next();
    } catch (error) {
        console.error("Error verifying workspace access:", error);
        return res.status(500).json({
            message: "Failed to verify workspace access"
        });
    }
};

/**
 * Handle document upload for a workspace.
 * POST /api/workspaces/:workspaceId/documents
 */
export const uploadDocument = async (req, res) => {
    // 1. Ensure a file was provided in the multipart request
    if (!req.file) {
        return res.status(400).json({
            message: "No file uploaded. Please provide a file under the 'file' field."
        });
    }

    const tempFilePath = req.file.path;

    try {
        // 2. Validate real file type via magic bytes
        const verifiedMimeType = await detectFileType(tempFilePath);

        if (!verifiedMimeType) {
            // Delete corrupt or spoofed file immediately from disk
            await fs.promises.unlink(tempFilePath).catch(() => {});
            return res.status(400).json({
                message: "Invalid or unsupported file content. Allowed types: PDF, JPEG, PNG, WEBP, MP3, WAV"
            });
        }

        // 3. Store relative path (e.g. 'uploads/uuid.ext') for portability and safety
        const relativeStoredPath = path
            .relative(process.cwd(), tempFilePath)
            .replace(/\\/g, "/");

        // 4. Save metadata in PostgreSQL using Prisma
        const document = await prisma.document.create({
            data: {
                workspaceId: req.params.workspaceId,
                originalName: req.file.originalname,
                storedPath: relativeStoredPath,
                mimeType: verifiedMimeType,
                fileSize: req.file.size
            }
        });

        // 5. Return safe metadata (never expose absolute server filesystem paths)
        return res.status(201).json({
            message: "Document uploaded successfully",
            document: {
                id: document.id,
                workspaceId: document.workspaceId,
                originalName: document.originalName,
                mimeType: document.mimeType,
                fileSize: document.fileSize,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt
            }
        });
    } catch (error) {
        console.error("Error saving document:", error);

        // 6. Rollback / Cleanup: delete the file from disk if the database insert failed
        await fs.promises.unlink(tempFilePath).catch(() => {});

        return res.status(500).json({
            message: "Failed to upload document"
        });
    }
};
