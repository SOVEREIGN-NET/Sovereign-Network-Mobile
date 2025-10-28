describe('Navigation E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should display all bottom tab navigation items', async () => {
    await expect(element(by.label('Dashboard'))).toBeVisible();
    await expect(element(by.label('Identity'))).toBeVisible();
    await expect(element(by.label('Wallet'))).toBeVisible();
    await expect(element(by.label('DAO'))).toBeVisible();
    await expect(element(by.label('Browser'))).toBeVisible();
  });

  it('should navigate to wallet tab', async () => {
    await element(by.label('Wallet')).tap();
    await expect(element(by.text('Your Wallets'))).toBeVisible();
  });

  it('should navigate to identity tab', async () => {
    await element(by.label('Identity')).tap();
    await expect(element(by.text('Your Identity'))).toBeVisible();
  });

  it('should navigate to DAO tab', async () => {
    await element(by.label('DAO')).tap();
    await expect(element(by.text('Active Proposals'))).toBeVisible();
  });

  it('should navigate to browser tab', async () => {
    await element(by.label('Browser')).tap();
    await expect(element(by.text('Web4 Browser'))).toBeVisible();
  });

  it('should navigate back to dashboard tab', async () => {
    await element(by.label('Dashboard')).tap();
    await expect(element(by.text('Dashboard'))).toBeVisible();
  });
});
