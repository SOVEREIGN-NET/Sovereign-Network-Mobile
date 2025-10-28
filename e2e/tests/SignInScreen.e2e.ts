describe('SignIn Screen E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should load the dashboard', async () => {
    await expect(element(by.id('dashboard-screen'))).toExist();
  });

  it('should display dashboard content', async () => {
    // Verify dashboard content is visible
    await expect(element(by.text(/ZHTP|Network|Status/))).toExist();
  });
});
