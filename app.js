// app.js - 小程序入口：课程表工作台 + 教学楼内部三维导航
App({
  globalData: {
    currentWeek: 1,
    totalWeeks: 16,

    // 教学楼内部导航：当前所在入口（决定导航起点）与已规划的路线
    currentEntranceNodeId: null, // 如 'ent_en_s2'
    currentLocationLabel: '',    // 如 '南门-中'
    route: null,                 // { waypoints:[...], cost, goalRoom:{number,floor,name} }
    buildingName: '教学楼A'
  },

  onLaunch() {
    // 一次性清理：移除历史遗留的示例/测试课程与活动，确保首次打开为空白课表。
    // 仅执行一次（用标记位控制），不会误删你之后录入的真实数据。
    const MIG = 'clear_legacy_sample_v1'
    if (wx.getStorageSync('migration_done') !== MIG) {
      wx.removeStorageSync('courses')
      wx.removeStorageSync('events')
      wx.setStorageSync('migration_done', MIG)
    }

    // 教学楼导航：恢复上次选择的入口
    const saved = wx.getStorageSync('nav_state') || {}
    if (saved.currentEntranceNodeId) {
      this.globalData.currentEntranceNodeId = saved.currentEntranceNodeId
      this.globalData.currentLocationLabel = saved.currentLocationLabel || ''
    }
  },

  // 选择入口后持久化
  setEntrance(nodeId, label) {
    this.globalData.currentEntranceNodeId = nodeId
    this.globalData.currentLocationLabel = label
    wx.setStorageSync('nav_state', { currentEntranceNodeId: nodeId, currentLocationLabel: label })
  },

  // 规划好路线后写入（scene 页读取渲染）
  setRoute(route) {
    this.globalData.route = route
  },

  clearRoute() {
    this.globalData.route = null
  }
})
