import express from "express";
import {
    createWorkspace,
    getWorkspaces,
    getWorkspaceById,
    deleteWorkspace
} from "../controllers/workspace.controller.js";
import {
    verifyWorkspaceAccess,
    uploadDocument,
    getWorkspaceDocuments
} from "../controllers/document.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { handleUploadSingle } from "../middleware/upload.middleware.js";

const router = express.Router();

// Enforce authentication on all workspace routes
router.use(authMiddleware);

router.post("/", createWorkspace);
router.get("/", getWorkspaces);
router.get("/:id", getWorkspaceById);
router.delete("/:id", deleteWorkspace);

// Workspace Document routes
router.post(
    "/:workspaceId/documents",
    verifyWorkspaceAccess,
    handleUploadSingle("file"),
    uploadDocument
);
router.get("/:workspaceId/documents", getWorkspaceDocuments);

export default router;
