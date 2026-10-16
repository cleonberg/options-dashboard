# React + Vite

## Alpaca account marks

The Account page can retrieve current stock and option quotes through the
`refreshAccountMarks` Firebase callable function. The Alpaca credentials stay
in Firebase Functions secrets; do not add them to the Vite app or commit them.

Before deploying:

1. Upgrade the Firebase project to the Blaze plan and link billing.
2. In Google Cloud Fraud Defense, create a score-based reCAPTCHA Enterprise
   web key for the `cleonberg.github.io` domain (enter only the domain, not the
   URL or repository path).
3. In Firebase App Check, register the existing web app with the reCAPTCHA
   Enterprise provider and the key created for that app. Put the public site
   key in a local `.env.local` file at the repository root:

   ```text
   VITE_FIREBASE_APPCHECK_SITE_KEY=your-recaptcha-enterprise-site-key
   ```

4. Install the Firebase CLI if needed, then log in and select the project:

   ```powershell
   npx firebase-tools login
   npx firebase-tools use option-dashboard-data
   ```

5. Set the Alpaca paper-account credentials as Firebase secrets. The CLI
   prompts for each value; never put the values in command arguments:

   ```powershell
   npx firebase-tools functions:secrets:set ALPACA_API_KEY
   npx firebase-tools functions:secrets:set ALPACA_API_SECRET
   ```

6. Deploy the function and rebuild/deploy the GitHub Pages app:

   ```powershell
   npx firebase-tools deploy --only functions:refreshAccountMarks
   npm run deploy
   ```

The function requires a signed-in Firebase user and a valid App Check token.
Stock marks use Alpaca's IEX feed; option marks use Alpaca's indicative feed.
Refresh only populates the current-day form fields; use **Save marks** to store
the snapshot. Firebase Functions require Blaze billing, and charges may apply
if usage exceeds the free quotas.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
