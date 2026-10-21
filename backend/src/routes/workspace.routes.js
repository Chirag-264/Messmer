import express from "express";
import {
    createWorkspace,
    getWorkspaces,
    getWorkspaceById,
    deleteWorkspace
} from "../controllers/workspace.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = express.Router();

// Enforce authentication on all workspace routes
router.use(authMiddleware);

router.post("/", createWorkspace);
router.get("/", getWorkspaces);
router.get("/:id", getWorkspaceById);
router.delete("/:id", deleteWorkspace);

export default router;
