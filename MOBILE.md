# Empire TimeCard — Native Apps (Android .apk + iOS)

This wraps the live **Empire TimeCard** site in a real native app shell using Capacitor.
Build the app once; future web changes you `git push` show up automatically — no rebuild needed.

- **App name:** Empire TimeCard
- **App ID:** com.empireelectricnv.timecard
- **Loads:** https://www.empireelectricnv.app (update capacitor.config.json if the domain changes)

---

## One-time setup (on your Mac)

```bash
cd ~/Desktop/empire-timecard
npm install                 # installs Capacitor (added to package.json)
npm run build               # produces the dist/ folder Capacitor needs
npx cap add android         # creates the android/ project
npx cap add ios             # creates the ios/ project
npx cap sync
```

You only do `cap add` once. After that, use `npm run mobile:sync` to refresh.

---

## ANDROID — build the .apk (free, no account)

1. Install **Android Studio**: https://developer.android.com/studio
2. In the project:
   ```bash
   npm run mobile:sync
   npx cap open android
   ```
   Android Studio opens the project.
3. Top menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. When it finishes, click **locate** in the popup (or find it at):
   `android/app/build/outputs/apk/debug/app-debug.apk`
5. **Send that `.apk`** to your Android teammate (AirDrop won't work to Android — use email, Google Drive, or text a download link).
6. On their phone: tap the file → if prompted, allow **"Install unknown apps"** for the app they opened it from → **Install**. Done. Empire TimeCard is now an app on their phone.

> The `app-debug.apk` is fine for your own team (sideloading). A signed "release" APK is only needed for the Google Play Store.

---

## iOS — distribute via TestFlight (you have the Apple Developer account ✅)

1. Install **Xcode** from the Mac App Store.
2. In the project:
   ```bash
   npm run mobile:sync
   npx cap open ios
   ```
   Xcode opens.
3. Click the **App** target → **Signing & Capabilities** → set **Team** to your Apple Developer account. Confirm Bundle Identifier is `com.empireelectricnv.timecard`.
4. Top bar: set the device target to **Any iOS Device (arm64)**.
5. Menu: **Product → Archive**. When done, the Organizer opens.
6. **Distribute App → App Store Connect → Upload.**
7. Go to **App Store Connect** (appstoreconnect.apple.com) → your app → **TestFlight** tab.
8. Add **Internal Testers** (your team's Apple ID emails — up to 100). Internal testers need **no Apple review** and get access in minutes.
9. Each teammate installs the **TestFlight** app from the App Store, accepts the invite, and installs Empire TimeCard.

> Use **Internal** testers (not External) to skip Apple's review entirely.

---

## Updating the apps later

Because the app loads the live site, **most updates need nothing** — just your normal `git push` and the app shows the new version on next launch.

You only rebuild/redistribute the app when you:
- change `capacitor.config.json`,
- upgrade Capacitor, or
- add a native capability (like background GPS — see below).

---

## Next step: true background GPS

Right now location updates only while the app is open/foreground (a browser limitation that carries into the shell). To update location **even when the phone is locked** while clocked in, we add the
`@capacitor-community/background-geolocation` plugin and a bit of code that uses it when running as a native app. That requires:
- adding location permission strings (iOS `Info.plist`, Android manifest),
- switching the app to bundle the web build (so the plugin bridge is reliable),
- one rebuild + redistribute.

Tell Claude "set up background GPS" once the shell apps are confirmed working and it'll wire this up.
