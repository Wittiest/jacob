import fs from "fs";
import path from "path";
import ignore, { Ignore } from "ignore";

export const concatenateFiles = (
  rootDir: string,
  filesToInclude?: string[],
) => {
  console.log("concatenateFiles", rootDir, filesToInclude);
  let gitignore: Ignore | null = null;
  const gitignorePath = path.join(rootDir, ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    gitignore = ignore().add(fs.readFileSync(gitignorePath).toString());
  }

  const output: string[] = [];

  const shouldIncludeFile = (relativePath: string, fileName: string) => {
    if (!filesToInclude || filesToInclude.length === 0) return true;

    const absolutePath = path.join(rootDir, relativePath); // Calculate the absolute path

    // Normalize and convert paths to lowercase for case-insensitive comparison
    const normalizedRelativePath = path.normalize(relativePath).toLowerCase();
    const normalizedAbsolutePath = path.normalize(absolutePath).toLowerCase();

    for (const fileToInclude of filesToInclude) {
      const normalizedFileToInclude = path
        .normalize(fileToInclude)
        .toLowerCase();

      if (
        normalizedFileToInclude === normalizedRelativePath ||
        normalizedFileToInclude === fileName.toLowerCase() ||
        normalizedFileToInclude === normalizedAbsolutePath
      ) {
        return true;
      }
    }

    return false;
  };

  const walkDir = (dir: string) => {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const relativePath = path.relative(rootDir, filePath);

      if (gitignore && gitignore.ignores(relativePath)) return;

      if (fs.statSync(filePath).isDirectory()) {
        walkDir(filePath);
      } else {
        // if (extensionFilter && path.extname(file) !== extensionFilter) return;
        if (!shouldIncludeFile(relativePath, file)) {
          return;
        }

        output.push(`__FILEPATH__${relativePath}__`);
        output.push(fs.readFileSync(filePath).toString("utf-8"));
      }
    });
  };

  walkDir(rootDir);
  return output.join("");
};

export const reconstructFiles = (
  concatFileContent: string,
  outputPath: string,
) => {
  const sections = concatFileContent.split(/__FILEPATH__(.*?)__/).slice(1);

  for (let i = 0; i < sections.length; i += 2) {
    const filePath = sections[i];
    let fileContent = sections[i + 1];
    const targetPath = path.join(outputPath, filePath);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    // if the first line in file content starts with _, remove it
    // keep doing this until the first line doesn't start with _
    while (
      fileContent?.length > 0 &&
      fileContent.split("\n")[0].startsWith("_")
    ) {
      fileContent = fileContent.split("\n").slice(1).join("\n");
    }
    fs.writeFileSync(targetPath, fileContent);
  }
};