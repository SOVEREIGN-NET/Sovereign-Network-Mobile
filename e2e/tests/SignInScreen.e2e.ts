describe('SignIn Screen E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should display sign in screen on launch', async () => {
    await expect(element(by.text('Sign In to ZHTP Network'))).toBeVisible();
  });

  it('should display demo credentials section', async () => {
    await expect(element(by.text('Demo Credentials'))).toBeVisible();
  });

  it('should show validation error when signing in without DID', async () => {
    await element(by.text('Sign In to ZHTP Network')).multiTap();
    await expect(element(by.text('DID address is required'))).toBeVisible();
  });

  it('should navigate to create identity when tapping create account', async () => {
    await element(by.text('Create New Identity')).tap();
    await expect(element(by.text('Create a New Identity'))).toBeVisible();
  });

  it('should navigate to recover identity when tapping recover account', async () => {
    await element(by.text('Recover Existing Identity')).tap();
    await expect(element(by.text('Recover Your Identity'))).toBeVisible();
  });

  it('should fill in demo credentials', async () => {
    await element(by.id('demoCredentialsButton')).tap();
    await expect(element(by.id('didInput'))).toHaveToggleValue(true);
  });
});
