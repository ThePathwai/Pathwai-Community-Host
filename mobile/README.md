# Pathwai on iPhone (TestFlight)

This folder wraps the live Pathwai site (the Railway URL in `capacitor.config.json`) in a real iPhone app.
The app is a thin shell: when you push a website update to Railway, testers get it the next time they open the app. You only
re-upload to TestFlight when you change this folder (icon, name, native features).

Do these on your Mac, in Terminal.

## One-time setup (about 20 minutes)
1. Install Xcode from the Mac App Store (free, large), open it once and accept the licence.
2. Install Node if you don't have it (you do, since you run the site locally).
3. `cd ~/dev/pathwai-repo/mobile`
4. `npm install`
5. `npx cap add ios`      (creates the `ios` folder)
6. `npm run icons`        (turns assets/icon-only.png into every icon size)
7. `npm run sync`
8. `npm run open`         (opens the project in Xcode)

## In Xcode
1. Click **App** (blue icon, top of the left column) → **Signing & Capabilities** → tick **Automatically manage signing** → pick your **Team** (your Apple Developer account).
2. Bundle Identifier must match the one you register at Apple (`com.pathwai.app` unless you changed it in `capacitor.config.json` and re-ran `npm run sync`).
3. Top bar: set the device to **Any iOS Device (arm64)**.
4. Menu **Product → Archive**. When it finishes, the Organizer opens.
5. Click **Distribute App → App Store Connect → Upload** and accept the defaults.

## In App Store Connect (appstoreconnect.apple.com)
1. **Apps → + → New App**: Platform iOS, Name Pathwai, Bundle ID from the list, any SKU (e.g. `pathwai-1`).
2. **TestFlight** tab → wait ~10 minutes for the build to finish processing. Answer the export-compliance question: the app uses only standard HTTPS, so choose "None of the algorithms mentioned above".
3. Add testers:
   - **Internal testing**: people you add under Users and Access (up to 100). No Apple review. They get an email.
   - **External testing**: create a group, add the build, and turn on **Public Link**. Anyone with the link can install through the TestFlight app (up to 10,000). The first build goes through Apple's quick Beta App Review (usually under a day).
4. For the review, put in **Test Information**: a one-line description, and "Tap **Try the demo** on the sign-in screen, no account needed."

## Each new build
Raise the build number in Xcode (App → General → Build), Archive, Upload again.
