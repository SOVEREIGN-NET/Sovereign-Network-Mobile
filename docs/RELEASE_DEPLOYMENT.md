# Android Release Deployment Guide

## Key Files

| File | Location |
|------|----------|
| Release keystore | `android/app/release.keystore` |
| Keystore credentials | `android/vault/release-keystore-credentials.txt` |
| Play Store service account | Set via `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` env var |

## Keystore Credentials

- **Password**: See `android/vault/release-keystore-credentials.txt` (gitignored)
- **Alias**: `release-key`
- **Key password**: See `android/vault/release-keystore-credentials.txt` (gitignored)
- **Type**: PKCS12
- **Regenerated**: 2026-02-24 (keep this keystore safe — losing it means you can't upload updates)

## Build AAB

```bash
cd android

RELEASE_KEYSTORE_PASSWORD="..." \
RELEASE_KEY_ALIAS="release-key" \
RELEASE_KEY_PASSWORD="..." \
./gradlew bundleRelease -x buildQuicJni
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## Deploy via Gradle (automated)

Requires the service account to have **Release Manager** role in Play Console (see Setup below).

```bash
cd android

GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="/path/to/your/service-account.json" \
RELEASE_KEYSTORE_PASSWORD="..." \
RELEASE_KEY_ALIAS="release-key" \
RELEASE_KEY_PASSWORD="..." \
./gradlew publishReleaseBundle -x buildQuicJni -PplayTrack=internal
```

Change `-PplayTrack=` to `alpha`, `beta`, or `production` as needed.

## Deploy Manually (Play Console)

1. Build the AAB (see above)
2. Open [Play Console](https://play.google.com/console)
3. Select **Sovereign Network Mobile**
4. Go to **Testing → Internal testing** (or desired track)
5. Click **Create new release**
6. Upload `app-release.aab`
7. Add release notes, save and roll out

## One-time Setup: Grant Service Account Access to Play Console

The service account JSON file must be linked to Play Console before automated uploads work.

1. Go to [Play Console](https://play.google.com/console) → **Settings → API access**
2. Under "Service accounts", find the account ending in `...iam.gserviceaccount.com`
3. Click **Grant access**
4. Set role to **Release Manager**
5. Click **Apply**

After this, the Gradle `publishReleaseBundle` command will work.

## One-time Setup: Upload Key Reset (if keystore was regenerated)

If the upload keystore was regenerated, Play Console will reject AABs signed with the new key.
You must submit the new certificate to Google:

```bash
# Export the new upload certificate
keytool -export -rfc \
  -keystore android/app/release.keystore \
  -alias release-key \
  -storepass "..." \
  -file upload_cert.pem
```

Then in Play Console → App → **Setup → App Signing → Request upload key reset**
— attach `upload_cert.pem` and submit. Google processes within a few hours.

## Bump Version Before Each Release

Edit `android/app/build.gradle`:

```groovy
versionCode 5          // increment by 1 each release
versionName "1.1.0"   // semantic version shown to users
```

## Update GitHub Secrets After Keystore Change

```bash
# Re-encode and push new keystore to GitHub secrets
base64 < android/app/release.keystore | gh secret set RELEASE_KEYSTORE_FILE
gh secret set RELEASE_KEYSTORE_PASSWORD --body "..."
gh secret set RELEASE_KEY_ALIAS --body "release-key"
gh secret set RELEASE_KEY_PASSWORD --body "..."
gh secret set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON < /path/to/your/service-account.json