import fs from "fs";
import path from "path";
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
 * Upload a document to a specific workspace.
 * POST /api/workspaces/:workspaceId/documents
 */
export const uploadDocument = async (req, res) => {
    const { workspaceId } = req.params;

    try {
        // If verifyWorkspaceAccess was not used upstream, verify here
        const workspace = req.workspace || await prisma.workspace.findFirst({
            where: {
                id: workspaceId,
                ownerId: req.user.userId
            }
        });

        if (!workspace) {
            if (req.file) {
                await fs.promises.unlink(req.file.path).catch(() => {});
            }
            return res.status(404).json({
                message: "Workspace not found"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                message: "No file uploaded. Please provide a file with field name 'file'"
            });
        }

        // Detect verified MIME type if available, otherwise use client-provided mimetype
        const verifiedMime = await detectFileType(req.file.path);
        const finalMimeType = verifiedMime || req.file.mimetype;

        const document = await prisma.document.create({
            data: {
                workspaceId,
                originalName: req.file.originalname,
                storedPath: req.file.path,
                mimeType: finalMimeType,
                fileSize: req.file.size
            }
        });

        return res.status(201).json({
            message: "Document uploaded successfully",
            document
        });
    } catch (error) {
        console.error("Error uploading document:", error);
        if (req.file) {
            await fs.promises.unlink(req.file.path).catch(() => {});
        }
        return res.status(500).json({
            message: "Failed to upload document"
        });
    }
};

/**
 * List all documents within a workspace.
 * GET /api/workspaces/:workspaceId/documents
 */
export const getWorkspaceDocuments = async (req, res) => {
    const { workspaceId } = req.params;

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

        const documents = await prisma.document.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" }
        });

        return res.status(200).json({
            documents
        });
    } catch (error) {
        console.error("Error fetching workspace documents:", error);
        return res.status(500).json({
            message: "Failed to fetch documents"
        });
    }
};

/**
 * Get metadata for a single document.
 * GET /api/documents/:id
 */
export const getDocumentById = async (req, res) => {
    const { id } = req.params;

    try {
        const document = await prisma.document.findUnique({
            where: { id },
            include: {
                workspace: {
                    select: {
                        id: true,
                        name: true,
                        ownerId: true
                    }
                }
            }
        });

        if (!document || document.workspace.ownerId !== req.user.userId) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        return res.status(200).json({
            document
        });
    } catch (error) {
        console.error("Error fetching document:", error);
        return res.status(500).json({
            message: "Failed to fetch document"
        });
    }
};

/**
 * Download a document file.
 * GET /api/documents/:id/download
 */
export const downloadDocument = async (req, res) => {
    const { id } = req.params;

    try {
        const document = await prisma.document.findUnique({
            where: { id },
            include: {
                workspace: {
                    select: {
                        ownerId: true
                    }
                }
            }
        });

        if (!document || document.workspace.ownerId !== req.user.userId) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        if (!fs.existsSync(document.storedPath)) {
            return res.status(404).json({
                message: "Physical file not found on disk"
            });
        }

        return res.download(document.storedPath, document.originalName);
    } catch (error) {
        console.error("Error downloading document:", error);
        return res.status(500).json({
            message: "Failed to download document"
        });
    }
};

/**
 * Delete a document from both the database and local disk.
 * DELETE /api/documents/:id
 */
export const deleteDocument = async (req, res) => {
    const { id } = req.params;

    try {
        const document = await prisma.document.findUnique({
            where: { id },
            include: {
                workspace: {
                    select: {
                        ownerId: true
                    }
                }
            }
        });

        if (!document || document.workspace.ownerId !== req.user.userId) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        // Delete database record first
        await prisma.document.delete({
            where: { id }
        });

        // Delete physical file from disk if it exists
        if (fs.existsSync(document.storedPath)) {
            await fs.promises.unlink(document.storedPath).catch((err) => {
                console.error("Failed to delete physical file:", err);
            });
        }

        return res.status(200).json({
            message: "Document deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting document:", error);
        return res.status(500).json({
            message: "Failed to delete document"
        });
    }
};
