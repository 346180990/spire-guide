/**
 * 策略助手 —— 启动时初始化云开发并预热设置
 */

App({
  globalData: {
    version: '1.0.0',
    cloudReady: false,
    cloudError: '',
  },

  onLaunch() {
    // 与「全天候」共用同一个云环境；换环境时只改这里
    const CLOUD_ENV = 'cloud1-d8gt1toadef33ae56';
    if (!wx.cloud) {
      this.globalData.cloudError = '当前基础库不支持云开发，请升级微信客户端';
      return;
    }
    try {
      wx.cloud.init({ env: CLOUD_ENV || undefined, traceUser: false });
      this.globalData.cloudReady = true;
    } catch (e) {
      this.globalData.cloudError = (e && e.message) || '云开发初始化失败';
    }
  },

  /** 页面统一用它判断是否可以直接调云函数 */
  requireCloud() {
    if (this.globalData.cloudReady) return '';
    return this.globalData.cloudError || '云开发未就绪';
  },
});
