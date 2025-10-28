describe('Create Identity Screen E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should navigate to create identity screen', async () => {
    await element(by.text('Create New Identity')).tap();
    await expect(element(by.text('Create a New Identity'))).toBeVisible();
  });

  it('should display identity type selector', async () => {
    await element(by.text('Create New Identity')).tap();
    await expect(element(by.text('Identity Type'))).toBeVisible();
    await expect(element(by.text('Citizen'))).toBeVisible();
    await expect(element(by.text('Business'))).toBeVisible();
  });

  it('should toggle biometric registration', async () => {
    await element(by.text('Create New Identity')).tap();
    const bioSwitch = element(by.id('biometricSwitch'));
    await bioSwitch.multiTap();
  });

  it('should require passphrase confirmation match', async () => {
    await element(by.text('Create New Identity')).tap();
    await element(by.id('passphraseInput')).typeText('TestPass123!');
    await element(by.id('confirmPassInput')).typeText('DifferentPass123!');
    await element(by.text('Create Identity')).tap();
    await expect(element(by.text('Passphrases do not match'))).toBeVisible();
  });

  it('should create identity with valid inputs', async () => {
    await element(by.text('Create New Identity')).tap();
    await element(by.id('displayNameInput')).typeText('Test User');
    await element(by.id('passphraseInput')).typeText('TestPass123!');
    await element(by.id('confirmPassInput')).typeText('TestPass123!');
    await element(by.id('termsCheckbox')).tap();
    await element(by.text('Create Identity')).tap();
    await expect(element(by.text('Dashboard'))).toBeVisible();
  });
});
