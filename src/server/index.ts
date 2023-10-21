import { setupGitHubWebhook } from "./webhooks/github";
import { gitHubOAuthCallback } from "./auth/github";
import {
  createAccessTokenKeys,
  getAccessToken,
  postAccessToken,
} from "./auth/authToken";
import { newIssueForFigmaFile } from "./design/figma";
import express from "express";
import cors from "cors";

const port = process.env["PORT"] ?? 4000;

// set up the server
export const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/api/auth/github/callback", gitHubOAuthCallback);

app.post("/api/auth/accessToken/", createAccessTokenKeys);
app.get("/api/auth/accessToken/:readKey", getAccessToken);
app.post("/api/auth/accessToken/:writeKey", express.json(), postAccessToken);
app.options("/api/design/:verb", cors());
app.post("/api/design/:verb", cors(), express.json(), newIssueForFigmaFile);

setupGitHubWebhook(app);

if (!process.env["VITE"]) {
  const frontendFiles = process.cwd() + "/dist";
  app.use(express.static(frontendFiles));
  app.get("/*", (_, res) => {
    res.sendFile(frontendFiles + "/index.html");
  });
  app.listen(port, () => console.log(`Server is running on port ${port}`));
}
