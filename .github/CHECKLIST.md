# Google Play Automation - Quick Checklist

## ✅ Completed

- [x] Release keystore generated (`android/app/release.keystore`)
- [x] Version updated to `1.1.0-beta.1` (build code: 1)
- [x] gradle-play-publisher plugin added to `android/build.gradle`
- [x] `app/build.gradle` configured for release signing
- [x] GitHub Actions workflow created (`.github/workflows/play-store-release.yml`)
- [x] Setup script created (`.github/setup-secrets.sh`)
- [x] Documentation created (`.github/PLAY_STORE_SETUP.md`)

## 🔵 Next: Add GitHub Secrets (Requires You)

**Time needed:** ~5 minutes

### Option 1: Automated Setup (Recommended)
```bash
cd /Users/supertramp/Dev/SovereignNetworkMobile
./.github/setup-secrets.sh
```

This will add these secrets automatically:
- `RELEASE_KEYSTORE_FILE`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `RELEASE_KEYSTORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

### Option 2: Manual Setup
Visit: `https://github.com/YOUR_ORG/YOUR_REPO/settings/secrets/actions`

Add each secret (see `PLAY_STORE_SETUP.md` for values)

## 🟡 Required: Google Play Console Configuration

**Time needed:** ~10 minutes

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app: **Sovereign Network Mobile**
3. Go to **Settings** → **API access**
4. Verify service account has access:
   - Find: `android@sovereign-network-mobile-906a1.iam.gserviceaccount.com`
   - Ensure it has **Release Manager** role

## 🟢 Test the Workflow

**Time needed:** ~5 minutes

Once secrets are added:

1. Go to GitHub → **Actions** tab
2. Select **Google Play Store Release**
3. Click **Run workflow**
4. Select track: `internal` (for testing)
5. Click **Run workflow**
6. Monitor the run and check logs

## 📋 Files Modified

| File | Changes |
|------|---------|
| `android/build.gradle` | Added gradle-play-publisher dependency |
| `android/app/build.gradle` | Added release signing config, play block, version update |
| `.github/workflows/play-store-release.yml` | New: GitHub Actions workflow |
| `.github/setup-secrets.sh` | New: Secrets setup script |
| `.github/PLAY_STORE_SETUP.md` | New: Complete documentation |

## ⚙️ Configuration Summary

**Keystore Details:**
- File: `android/app/release.keystore`
- Alias: `release-key`
- Password: `Tachipirina500!`
- Validity: 10,000 days

**Build Config:**
- Version: `1.1.0-beta.1`
- Build Code: Auto-incremented per release
- Min SDK: 28
- Target SDK: 36
- Output: Android App Bundle (AAB)

**Deployment:**
- Trigger: Manual workflow dispatch or Git tag (v*.*.*)
- Tracks: internal, alpha, beta, production
- Auto-release: Tags automatically release to production

## 🚀 First Release

After secrets are configured:

```bash
# Option 1: Internal test release (manual)
# Visit: https://github.com/YOUR_REPO/actions
# Select "Google Play Store Release" → Run workflow → track: internal

# Option 2: Production release (automatic via tag)
git tag v1.1.0
git push origin v1.1.0
```

## ⚠️ Important Notes

- **DO NOT** commit `release.keystore` to git (it's in `.gitignore` by default)
- **DO NOT** commit service account JSON (keep in Downloads)
- **DO NOT** share keystore password
- Service account must have **Release Manager** role, not just "Editor"
- First release may take 2-3 hours to appear in Play Store

## Support

See `.github/PLAY_STORE_SETUP.md` for:
- Detailed setup instructions
- Troubleshooting guide
- Security best practices
- Advanced configuration

---

**Status**: 90% Ready | Waiting for: GitHub Secrets Setup + Play Console verification