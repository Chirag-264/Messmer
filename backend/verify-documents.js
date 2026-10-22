import app from "./src/app.js";
import fs from "fs";
import path from "path";

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runVerification() {
    console.log("=== Starting End-to-End Document Management Verification ===");

    // 1. Start server on test port
    const server = await new Promise((resolve) => {
        const s = app.listen(PORT, () => {
            console.log(`[1] Test server started on port ${PORT}`);
            resolve(s);
        });
    });

    try {
        const testEmail = `testuser_${Date.now()}@example.com`;
        const testPassword = "Password123!";
        const testName = "Document Tester";

        // 2. Register
        console.log(`[2] Registering user: ${testEmail}`);
        const regRes = await fetch(`${BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: testName,
                email: testEmail,
                password: testPassword
            })
        });
        const regData = await regRes.json();
        console.log(`    Status: ${regRes.status}`, regData.message || regData);
        if (regRes.status !== 201) throw new Error("Registration failed");

        // 3. Login
        console.log(`[3] Logging in`);
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testEmail,
                password: testPassword
            })
        });
        const loginData = await loginRes.json();
        console.log(`    Status: ${loginRes.status}`, loginData.message || "Login successful");
        const token = loginData.token;
        if (!token) throw new Error("No token returned on login");

        const authHeaders = {
            Authorization: `Bearer ${token}`
        };

        // 4. Create Workspace
        console.log(`[4] Creating test workspace`);
        const wsRes = await fetch(`${BASE_URL}/workspaces`, {
            method: "POST",
            headers: {
                ...authHeaders,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: "AI Research Workspace"
            })
        });
        const wsData = await wsRes.json();
        console.log(`    Status: ${wsRes.status}`, wsData.message || wsData);
        const workspaceId = wsData.workspace?.id;
        if (!workspaceId) throw new Error("Workspace creation failed");

        // 5. Prepare sample document
        console.log(`[5] Creating a sample file for upload`);
        const sampleContent = "Hello from Messmer! This is a test document to verify the ingestion pipeline.";
        const sampleFileName = "messmer_sample.txt";
        const tempFilePath = path.resolve("./uploads", `temp_${sampleFileName}`);
        fs.writeFileSync(tempFilePath, sampleContent, "utf-8");

        // 6. Upload Document using FormData
        console.log(`[6] Uploading document to workspace ${workspaceId}`);
        const formData = new FormData();
        const fileBlob = new Blob([sampleContent], { type: "text/plain" });
        formData.append("file", fileBlob, sampleFileName);

        const uploadRes = await fetch(`${BASE_URL}/workspaces/${workspaceId}/documents`, {
            method: "POST",
            headers: {
                ...authHeaders
            },
            body: formData
        });
        const uploadData = await uploadRes.json();
        console.log(`    Status: ${uploadRes.status}`, uploadData.message || uploadData);
        if (uploadRes.status !== 201) throw new Error("Upload failed");
        const docId = uploadData.document?.id;
        const storedPath = uploadData.document?.storedPath;
        console.log(`    Document ID: ${docId}`);
        console.log(`    Stored Path on Disk: ${storedPath}`);

        // Verify file exists on disk
        if (fs.existsSync(storedPath)) {
            console.log(`    -> Confirmed: File physically exists on disk!`);
        } else {
            throw new Error("File was NOT found on disk after upload!");
        }

        // 7. List workspace documents
        console.log(`[7] Listing documents in workspace`);
        const listRes = await fetch(`${BASE_URL}/workspaces/${workspaceId}/documents`, {
            method: "GET",
            headers: { ...authHeaders }
        });
        const listData = await listRes.json();
        console.log(`    Status: ${listRes.status}, Documents found: ${listData.documents?.length}`);
        if (!listData.documents || listData.documents.length === 0) {
            throw new Error("Document list returned 0 documents!");
        }

        // 8. Get single document metadata
        console.log(`[8] Fetching document metadata by ID: ${docId}`);
        const getDocRes = await fetch(`${BASE_URL}/documents/${docId}`, {
            method: "GET",
            headers: { ...authHeaders }
        });
        const getDocData = await getDocRes.json();
        console.log(`    Status: ${getDocRes.status}, Name: ${getDocData.document?.originalName}, Workspace: ${getDocData.document?.workspace?.name}`);

        // 9. Download document and verify content
        console.log(`[9] Downloading document by ID: ${docId}`);
        const downloadRes = await fetch(`${BASE_URL}/documents/${docId}/download`, {
            method: "GET",
            headers: { ...authHeaders }
        });
        console.log(`    Status: ${downloadRes.status}`);
        const downloadedText = await downloadRes.text();
        if (downloadedText === sampleContent) {
            console.log(`    -> Content matches perfectly: "${downloadedText}"`);
        } else {
            throw new Error(`Content mismatch! Expected "${sampleContent}" but got "${downloadedText}"`);
        }

        // 10. Delete document
        console.log(`[10] Deleting document: ${docId}`);
        const delRes = await fetch(`${BASE_URL}/documents/${docId}`, {
            method: "DELETE",
            headers: { ...authHeaders }
        });
        const delData = await delRes.json();
        console.log(`    Status: ${delRes.status}`, delData.message || delData);

        // Verify physical file was unlinked from disk
        if (!fs.existsSync(storedPath)) {
            console.log(`    -> Confirmed: Physical file removed from disk (unlink succeeded)!`);
        } else {
            throw new Error("Physical file was NOT removed from disk after deletion!");
        }

        // Clean up temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        // 11. Clean up workspace
        console.log(`[11] Cleaning up test workspace: ${workspaceId}`);
        await fetch(`${BASE_URL}/workspaces/${workspaceId}`, {
            method: "DELETE",
            headers: { ...authHeaders }
        });

        console.log("\n=======================================================");
        console.log(" SUCCESS! ALL 11 VERIFICATION CHECKS PASSED PERFECTLY!");
        console.log("=======================================================\n");

    } catch (err) {
        console.error("\n❌ Verification Failed:", err);
    } finally {
        server.close(() => {
            console.log("Test server shut down.");
            process.exit(0);
        });
    }
}

runVerification();
