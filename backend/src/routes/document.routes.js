import express from "express";
import {
    getDocumentById,
    downloadDocument,
    deleteDocument
} from "../controllers/document.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// Enforce authentication on all document routes
router.use(authMiddleware);

router.get("/:id", getDocumentById);
router.get("/:id/download", downloadDocument);
router.delete("/:id", deleteDocument);

export default router;
