describe('Navigation E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should launch the app on dashboard', async () => {
    await expect(element(by.id('dashboard-screen'))).toExist();
  });

  it('should navigate to wallet tab', async () => {
    await element(by.text('Wallet')).tap();
    await expect(element(by.id('wallet-screen'))).toExist();
  });

  it('should navigate to identity tab', async () => {
    await element(by.text('Identity')).tap();
    await expect(element(by.id('identity-screen'))).toExist();
  });

  it('should navigate to DAO tab', async () => {
    await element(by.text('DAO')).tap();
    await expect(element(by.id('dao-screen'))).toExist();
  });

  it('should navigate to browser tab', async () => {
    await element(by.text('Web4')).tap();
    await expect(element(by.id('browser-screen'))).toExist();
  });
});
