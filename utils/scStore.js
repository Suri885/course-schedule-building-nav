// utils/scStore.js
// 第二课堂本地存储助手（记录驱动计分，类微信记账）
//
// 计分口径（按办法满分封顶，总额 600 分）：
//   任务实得 = 该任务下「已确认」记录的加分之合，封顶该任务 cap
//   模块得分 = 该模块下各任务实得之和，封顶办法规定的模块上限（基础 80% / 拓展 20%）
//   模块目标 = 该模块下各任务 cap 之和，同样封顶模块上限
//   板块得分 = 基础 + 拓展，封顶板块满分（180 / 120 / 100 / 100 / 100）
//   总分     = 五个板块之和，封顶 600 分
//
// 加分记录状态：
//   confirmed = true  已确认加分（已在学校系统申请并通过，计入得分）
//   confirmed = false 待确认（仅本人登记，不计入得分）
//   老数据没有该字段，视为已确认，避免历史分数归零

const { SECTIONS, findTask, TOTAL_MAX } = require('./secondClass')
const RECORDS_KEY = 'sc_records'   // { taskId: [ {id,text,images:[path],score,time,confirmed} ] }

function getRecords() {
  return wx.getStorageSync(RECORDS_KEY) || {}
}

function getTaskRecords(taskId) {
  return getRecords()[taskId] || []
}

function addRecord(taskId, record) {
  const all = getRecords()
  const list = all[taskId] || []
  list.unshift(record)   // 新记录在前
  all[taskId] = list
  wx.setStorageSync(RECORDS_KEY, all)
}

function deleteRecord(taskId, recId) {
  const all = getRecords()
  const list = (all[taskId] || []).filter(r => r.id !== recId)
  all[taskId] = list
  wx.setStorageSync(RECORDS_KEY, all)
}

// 标记某条记录是否已确认加分
function setRecordConfirmed(taskId, recId, confirmed) {
  const all = getRecords()
  const list = all[taskId] || []
  const rec = list.find(r => r.id === recId)
  if (rec) rec.confirmed = !!confirmed
  all[taskId] = list
  wx.setStorageSync(RECORDS_KEY, all)
}

// 兼容老数据：没有 confirmed 字段的记录按「已确认」处理
function isConfirmedRecord(r) {
  return r.confirmed !== false
}

function capOf(taskId) {
  const r = findTask(taskId)
  return r ? (Number(r.task.cap) || 0) : 0
}

// 任务实得：已确认记录之和，封顶 cap
function getTaskScore(taskId) {
  const sum = getTaskRecords(taskId)
    .filter(isConfirmedRecord)
    .reduce((a, x) => a + (Number(x.score) || 0), 0)
  const cap = capOf(taskId)
  return cap ? Math.min(sum, cap) : sum
}

// 任务待确认分：登记了但还没确认的加分之和（不计入得分）
function getTaskPendingScore(taskId) {
  return getTaskRecords(taskId)
    .filter(r => !isConfirmedRecord(r))
    .reduce((a, x) => a + (Number(x.score) || 0), 0)
}

// 任务还差多少分（扣分项不算目标）
function getTaskRemain(task) {
  if (!task || task.penalty) return 0
  const cap = Number(task.cap) || 0
  return Math.max(0, cap - getTaskScore(task.id))
}

// ===== 模块级（基础 / 拓展，按办法模块上限封顶） =====
function getModuleGot(tasks, max) {
  const sum = (tasks || []).reduce((a, t) => a + getTaskScore(t.id), 0)
  return max ? Math.min(sum, Number(max)) : sum
}

function getModuleTarget(tasks, max) {
  const sum = (tasks || []).filter(t => !t.penalty).reduce((a, t) => a + (Number(t.cap) || 0), 0)
  return max ? Math.min(sum, Number(max)) : sum
}

function getModuleRemain(tasks, max) {
  return Math.max(0, getModuleTarget(tasks, max) - getModuleGot(tasks, max))
}

function getModulePending(tasks) {
  return (tasks || []).reduce((a, t) => a + getTaskPendingScore(t.id), 0)
}

// ===== 板块级（按板块满分封顶） =====
function getSectionTotals(section) {
  const basicMax = Number(section.basicMax) || 0
  const extMax = Number(section.extMax) || 0
  const secMax = Number(section.totalMax) || 0

  const basicGot = getModuleGot(section.basic, basicMax)
  const extGot = getModuleGot(section.ext, extMax)
  const basicTarget = getModuleTarget(section.basic, basicMax)
  const extTarget = getModuleTarget(section.ext, extMax)

  const target = secMax ? Math.min(basicTarget + extTarget, secMax) : basicTarget + extTarget
  const got = secMax ? Math.min(basicGot + extGot, secMax) : basicGot + extGot

  return {
    basicGot: basicGot,
    basicTarget: basicTarget,
    basicRemain: Math.max(0, basicTarget - basicGot),
    extGot: extGot,
    extTarget: extTarget,
    extRemain: Math.max(0, extTarget - extGot),
    got: got,
    target: target,
    remain: Math.max(0, target - got),
    pending: getModulePending(section.basic) + getModulePending(section.ext)
  }
}

function getSectionScore(section) {
  return getSectionTotals(section).got
}

function getSectionTarget(section) {
  return getSectionTotals(section).target
}

function getSectionRemain(section) {
  return getSectionTotals(section).remain
}

// ===== 全局：办法满分 600 分 =====
function getTotalScore() {
  const sum = SECTIONS.reduce((a, s) => a + getSectionScore(s), 0)
  return Math.min(sum, TOTAL_MAX)
}

function getTotalTarget() {
  return TOTAL_MAX
}

function getTotalRemain() {
  return Math.max(0, getTotalTarget() - getTotalScore())
}

function getTotalPending() {
  return SECTIONS.reduce((a, s) => a + getModulePending(s.basic) + getModulePending(s.ext), 0)
}

module.exports = {
  getRecords, getTaskRecords, addRecord, deleteRecord, setRecordConfirmed, isConfirmedRecord,
  getTaskScore, getTaskPendingScore, getTaskRemain,
  getModuleGot, getModuleTarget, getModuleRemain, getModulePending,
  getSectionTotals, getSectionScore, getSectionTarget, getSectionRemain,
  getTotalScore, getTotalTarget, getTotalRemain, getTotalPending
}
