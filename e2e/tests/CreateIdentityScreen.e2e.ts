describe('Create Identity Screen E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should load the dashboard on app start', async () => {
    await expect(element(by.id('dashboard-screen'))).toExist();
  });

  it('should display dashboard text', async () => {
    // Verify dashboard content is visible
    await expect(element(by.text(/ZHTP|Network/))).toExist();
  });
});
