# Google Play Console Automation Setup

This guide walks you through setting up automated releases to Google Play Console via GitHub Actions.

## Prerequisites

- ✅ Release keystore generated at `android/app/release.keystore`
- ✅ Service account JSON key from Google Cloud Console
- ✅ GitHub CLI installed (`gh`)
- ✅ App created in Google Play Console
- ✅ Service account has "Release Manager" role in Play Console

## Files Created

| File | Purpose |
|------|---------|
| `.github/workflows/play-store-release.yml` | GitHub Actions workflow for building & releasing |
| `android/app/release.keystore` | Android signing certificate |
| `.github/setup-secrets.sh` | Script to add GitHub Secrets |
| `.github/PLAY_STORE_SETUP.md` | This file |

## Step 1: Verify Release Keystore

The release keystore has been generated at:
```
android/app/release.keystore
```

Details:
- **Alias**: `release-key`
- **Password**: see `android/vault/release-keystore-credentials.txt` (gitignored)
- **Validity**: 10,000 days

## Step 2: Verify Service Account

Your service account JSON is at:
```
/Users/supertramp/Downloads/sovereign-network-mobile-906a1-7093f108fa6c.json
```

In Google Play Console:
1. Go to **Settings** → **API access**
2. Click **CREATE NEW SERVICE ACCOUNT**
3. Link your Google Cloud project service account
4. Grant it the **Release Manager** role

## Step 3: Add GitHub Secrets

Run the setup script:
```bash
chmod +x .github/setup-secrets.sh
.github/setup-secrets.sh
```

This will add these secrets to your GitHub repository:

| Secret Name | Value |
|-------------|-------|
| `RELEASE_KEYSTORE_FILE` | Base64-encoded keystore file |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON content |
| `RELEASE_KEYSTORE_PASSWORD` | From `android/vault/release-keystore-credentials.txt` |
| `RELEASE_KEY_ALIAS` | `release-key` |
| `RELEASE_KEY_PASSWORD` | From `android/vault/release-keystore-credentials.txt` |

### Manual Setup (if script doesn't work)

Go to: `https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions`

Add each secret:

**1. RELEASE_KEYSTORE_FILE** (base64-encoded)
```bash
base64 < android/app/release.keystore | pbcopy
```
Paste into the secret value.

**2. GOOGLE_PLAY_SERVICE_ACCOUNT_JSON** (JSON content)
```bash
cat /Users/supertramp/Downloads/sovereign-network-mobile-906a1-7093f108fa6c.json
```
Copy the entire JSON and paste it.

**3. RELEASE_KEYSTORE_PASSWORD**
```
<see android/vault/release-keystore-credentials.txt>
```

**4. RELEASE_KEY_ALIAS**
```
release-key
```

**5. RELEASE_KEY_PASSWORD**
```
<see android/vault/release-keystore-credentials.txt>
```

## Step 4: Test the Workflow

### Option A: Manual Trigger
1. Go to **Actions** tab in GitHub
2. Select **Google Play Store Release**
3. Click **Run workflow**
4. Choose track: `internal` (recommended for testing)
5. Click **Run workflow**

### Option B: Tag-based Release (Production)
```bash
git tag v1.1.0
git push origin v1.1.0
```

This will automatically build and release to **production** track.

## Release Tracks

The workflow supports multiple release tracks:

| Track | Use Case | Audience |
|-------|----------|----------|
| `internal` | Internal testing | Only your team |
| `alpha` | Alpha testing | Limited users |
| `beta` | Beta testing | Wider user group |
| `production` | Production release | All users (auto on tag) |

## Version Management

### Automatic Version Code
- Version code is computed from current timestamp
- Example: `1706000000` (last 10 digits of epoch)

### Manual Version Update
Edit `android/app/build.gradle`:
```gradle
versionCode 2
versionName "1.1.0-beta.2"
```

## Build Artifacts

After a successful run:
- **AAB (Android App Bundle)** → Google Play Console
- **Release notes** → GitHub releases page
- **Build logs** → GitHub Actions tab

## Troubleshooting

### Workflow fails with "keystore not found"
```
Ensure RELEASE_KEYSTORE_FILE secret is properly base64-encoded
```

### Permission denied error
```
Check that service account has "Release Manager" role in Play Console
Settings → API access → Grant permission to service account
```

### Build fails with signing error
```
Verify these secrets are set correctly:
- RELEASE_KEYSTORE_PASSWORD
- RELEASE_KEY_ALIAS
- RELEASE_KEY_PASSWORD
```

### Artifact not found
```
Check that buildRelease task completed successfully in logs
Verify AAB is generated at: app/build/outputs/bundle/release/
```

## Security Best Practices

✅ **Do**:
- Store keystore password in GitHub Secrets (never in code)
- Rotate keystore every few years
- Limit service account permissions to minimum required
- Use separate keys for dev/staging/production

❌ **Don't**:
- Commit `release.keystore` to version control
- Share keystore password via email/chat
- Use same keystore for multiple apps
- Store credentials in build.gradle files

## Environment Variables in Build

The workflow passes these to Gradle:

```bash
./gradlew bundleRelease \
  -PVERSION_CODE="1706000000" \
  -PRELEASE_KEYSTORE_PASSWORD="..." \
  -PRELEASE_KEY_ALIAS="release-key" \
  -PRELEASE_KEY_PASSWORD="..."
```

These are read by `app/build.gradle`:
```gradle
release {
    storePassword System.getenv("RELEASE_KEYSTORE_PASSWORD")
    keyAlias System.getenv("RELEASE_KEY_ALIAS")
    keyPassword System.getenv("RELEASE_KEY_PASSWORD")
}
```

## Advanced: Custom Release Notes

Edit `.github/workflows/play-store-release.yml` to customize release notes that appear in Play Store listings.

## Rollback

If you release a broken version:
1. Go to Google Play Console
2. Select your app
3. Go to **Release** → Your track
4. Click **Edit release**
5. Remove the broken build
6. Promote or create a new release

## References

- [Google Play Console Docs](https://support.google.com/googleplay/android-developer)
- [gradle-play-publisher](https://github.com/Triple-T/gradle-play-publisher)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)