import prisma from "../lib/prisma.js";

/**
 * Create a new workspace for the authenticated user.
 * POST /api/workspaces
 */
export const createWorkspace = async (req, res) => {
    const name = req.body.name?.trim();

    if (!name) {
        return res.status(400).json({
            message: "Workspace name is required"
        });
    }

    if (name.length > 100) {
        return res.status(400).json({
            message: "Workspace name cannot exceed 100 characters"
        });
    }

    try {
        const workspace = await prisma.workspace.create({
            data: {
                name,
                ownerId: req.user.userId
            }
        });

        return res.status(201).json({
            message: "Workspace created successfully",
            workspace
        });
    } catch (error) {
        console.error("Error creating workspace:", error);
        return res.status(500).json({
            message: "Failed to create workspace"
        });
    }
};

/**
 * List all workspaces owned by the authenticated user.
 * GET /api/workspaces
 */
export const getWorkspaces = async (req, res) => {
    try {
        const workspaces = await prisma.workspace.findMany({
            where: {
                ownerId: req.user.userId
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return res.status(200).json({
            workspaces
        });
    } catch (error) {
        console.error("Error fetching workspaces:", error);
        return res.status(500).json({
            message: "Failed to fetch workspaces"
        });
    }
};

/**
 * Get a single workspace by ID owned by the authenticated user.
 * GET /api/workspaces/:id
 */
export const getWorkspaceById = async (req, res) => {
    const { id } = req.params;

    try {
        const workspace = await prisma.workspace.findFirst({
            where: {
                id,
                ownerId: req.user.userId
            }
        });

        if (!workspace) {
            return res.status(404).json({
                message: "Workspace not found"
            });
        }

        return res.status(200).json({
            workspace
        });
    } catch (error) {
        console.error("Error fetching workspace:", error);
        return res.status(500).json({
            message: "Failed to fetch workspace"
        });
    }
};

/**
 * Delete a workspace owned by the authenticated user.
 * DELETE /api/workspaces/:id
 */
export const deleteWorkspace = async (req, res) => {
    const { id } = req.params;

    try {
        const workspace = await prisma.workspace.findFirst({
            where: {
                id,
                ownerId: req.user.userId
            }
        });

        if (!workspace) {
            return res.status(404).json({
                message: "Workspace not found"
            });
        }

        await prisma.workspace.delete({
            where: { id }
        });

        return res.status(200).json({
            message: "Workspace deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting workspace:", error);
        return res.status(500).json({
            message: "Failed to delete workspace"
        });
    }
};
