import { Issue, Repository } from "@octokit/webhooks-types";
import { z } from "zod";

import { getSourceMap, getTypes, getImages } from "../analyze/sourceMap";
import { traverseCodebase } from "../analyze/traverse";
import {
  parseTemplate,
  constructNewOrEditSystemPrompt,
  RepoSettings,
  getSnapshotUrl,
  getStyles,
} from "../utils";
import { concatenateFiles, reconstructFiles } from "../utils/files";
import {
  sendGptRequestWithSchema,
  sendGptVisionRequest,
} from "../openai/request";
import { setNewBranch } from "../git/branch";
import { checkAndCommit } from "./checkAndCommit";
import { saveImages } from "../utils/images";

export const ExtractedIssueInfoSchema = z.object({
  stepsToAddressIssue: z.string().nullable().optional(), // a step-by-step plan of how a developer would address the given issue
  filesToCreate: z.array(z.string()).nullable().optional(), // an array of file paths that will be created by the developer. The paths CANNOT be in the list of valid file names.
  filesToUpdate: z.array(z.string()).nullable().optional(), // an array of file paths that will be updated by the developer
});

export type ExtractedIssueInfo = z.infer<typeof ExtractedIssueInfoSchema>;

export async function editFiles(
  repository: Repository,
  token: string,
  issue: Issue,
  rootPath: string,
  repoSettings?: RepoSettings,
) {
  const snapshotUrl = getSnapshotUrl(issue.body);
  const projectFiles = await traverseCodebase(rootPath);
  // When we start processing PRs, need to handle appending additionalComments
  const issueBody = issue.body ?? "";
  const issueText = `${issue.title} ${issueBody}`;

  const extractedIssueTemplateParams = {
    projectFiles,
    issueText,
  };

  const extractedIssueSystemPrompt = parseTemplate(
    "dev",
    "extracted_issue",
    "system",
    extractedIssueTemplateParams,
  );
  const extractedIssueUserPrompt = parseTemplate(
    "dev",
    "extracted_issue",
    "user",
    extractedIssueTemplateParams,
  );
  const extractedIssue = (await sendGptRequestWithSchema(
    extractedIssueUserPrompt,
    extractedIssueSystemPrompt,
    ExtractedIssueInfoSchema,
    0.2,
  )) as ExtractedIssueInfo;

  // TODO: handle previousAssessments
  const filesToUpdate = extractedIssue.filesToUpdate || [];

  console.log(`[${repository.full_name}] Files to update:`, filesToUpdate);
  if (!filesToUpdate?.length) {
    console.log("\n\n\n\n^^^^^^\n\n\n\nERROR: No files to update\n\n\n\n");
    throw new Error("No files to update");
  }
  const code = concatenateFiles(
    rootPath,
    filesToUpdate,
    extractedIssue.filesToCreate,
  );
  console.log(`[${repository.full_name}] Concatenated code:\n\n`, code);

  const sourceMap = getSourceMap(rootPath, repoSettings);
  const types = getTypes(rootPath, repoSettings);
  const packages = Object.keys(repoSettings?.packageDependencies ?? {}).join(
    "\n",
  );
  const styles = await getStyles(rootPath, repoSettings);
  let images = await getImages(rootPath, repoSettings);
  images = await saveImages(images, issue?.body, rootPath, repoSettings);

  // TODO: populate tailwind colors and leverage in system prompt

  const codeTemplateParams = {
    sourceMap,
    types,
    packages,
    styles,
    images,
    code,
    issueBody,
    plan: extractedIssue.stepsToAddressIssue ?? "",
    snapshotUrl: snapshotUrl ?? "",
  };

  const codeSystemPrompt = constructNewOrEditSystemPrompt(
    "code_edit_files",
    codeTemplateParams,
    repoSettings,
  );
  const codeUserPrompt = parseTemplate(
    "dev",
    "code_edit_files",
    "user",
    codeTemplateParams,
  );

  // Call sendGptRequest with the issue and concatenated code file
  const updatedCode = (await sendGptVisionRequest(
    codeUserPrompt,
    codeSystemPrompt,
    snapshotUrl,
    0.2,
  )) as string;

  if (updatedCode.length < 10 || !updatedCode.includes("__FILEPATH__")) {
    console.log(`[${repository.full_name}] code`, code);
    console.log(`[${repository.full_name}] No code generated. Exiting...`);
    throw new Error("No code generated");
  }
  const newBranch = `jacob-issue-${issue.number}-${Date.now()}`;

  await setNewBranch(rootPath, newBranch);

  reconstructFiles(updatedCode, rootPath);

  await checkAndCommit({
    repository,
    token,
    rootPath,
    branch: newBranch,
    repoSettings,
    commitMessage: `JACoB PR for Issue ${issue.title}`,
    issue,
    newPrTitle: `JACoB PR for Issue ${issue.title}`,
    newPrBody: `## Summary:\n\n${issue.body}\n\n## Plan:\n\n${
      extractedIssue.stepsToAddressIssue ?? ""
    }`,
    newPrReviewers: issue.assignees.map((assignee) => assignee.login),
  });
}
