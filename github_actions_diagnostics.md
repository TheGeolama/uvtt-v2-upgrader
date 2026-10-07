# GitHub Actions Diagnostics & Resolution Guide

If your GitHub Actions deployment is failing with **`Process completed with exit code 1`**, it means there is an active compilation, installation, or configuration error in your build steps. 

This guide will help you understand the difference between GitHub's runner warnings and the actual fatal error, and show you exactly how to locate and fix the issue.

---

## 1. Decoupling the Node.js 20 Warning (The "False Alarm")

You will see this warning highlighted in yellow or red in your logs:
> *Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4.*

### 🔍 What this actually means:
* **This is a runner warning, NOT the fatal error.** It does not cause `exit code 1`.
* It simply means that the *actions themselves* (written and maintained by GitHub, like `actions/checkout`) were internally packaged using Node 20. Because GitHub's physical runners have transitioned to Node 24, the runner forces those actions to execute under Node 24.
* This warning is harmless and will persist for many public repositories until GitHub publishes updated major versions of their core actions (e.g., `@v5`) that natively compile on Node 24's engine.

---

## 2. How to Locate the Real Fatal Error

The **`exit code 1`** means one of your build steps threw a hard error. To find it, open your failed run on GitHub:

1. Click on the **Actions** tab in your GitHub repository.
2. Click on the failed workflow run at the top of the list.
3. On the left side, click on the **build-and-deploy** job.
4. You will see a list of steps. Look for the step displaying a **Red Cross (X)**.
5. Click to expand that step and scroll to the bottom. Look for the actual error log.

The real culprit is almost always inside one of these three steps:

### A. "Install Project Dependencies"
* **Typical Error:** `npm ERR! cipreview` or `npm ERR! Cannot read properties of null (reading 'matches')`.
* **Why it happens:** The runner tried to run `npm ci` but couldn't find a `package-lock.json` file, or the lockfile is out of sync with your `package.json` dependencies.
* **The Fix:** Run `npm install` locally to regenerate your `package-lock.json`, commit it, and push it to GitHub.

### B. "Compile Production Build"
* **Typical Error:** TypeScript compilation errors, Svelte syntax warnings treated as fatal errors, or missing asset imports.
* **Why it happens:** Because you recently upgraded to **PixiJS v8** [cite: 282, 283], any legacy v7 PixiJS syntax remaining in your Svelte or JS files (like drawing calls using `beginFill` instead of `fill`) [cite: 280, 283] will cause the Vite bundler to fail the compile stage.
* **The Fix:** Read the traceback in the logs—it will point to the exact file and line number causing the build failure.

---

## 3. Recommended Actions & Workflows

To make your CI/CD runner as resilient as possible, make sure your `.github/workflows/deploy-upgrader.yml` matches this optimized, warning-minimized configuration:

```yaml
name: Deploy Svelte Upgrader App to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Codebase
        uses: actions/checkout@v4 # Keep v4 (standard)

      - name: Set up Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-version: 24 # Lock project execution to modern Node 24
          cache: 'npm'

      - name: Install Project Dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi

      - name: Compile Production Build
        run: npm run build
        env:
          VITE_BASE_PATH: /uvtt-v2-upgrader/

      - name: Initialize Pages Metadata
        uses: actions/configure-pages@v5 # Upgraded to v5 to mitigate Node 20 warnings

      - name: Upload Static Web Assets
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Stream Deployment to GitHub CDN
        id: deployment
        uses: actions/deploy-pages@v4
```
