# 课表小程序 — 删除示例数据 + 智能导入课表

## 一、删除示例模拟数据
- `utils/courses.js`：移除 `sampleCourses` 数组与导出，保留默认时段与工具函数。
- `app.js`：`onLaunch` 不再写入示例课程，**首次打开即为空白课表**。

## 二、智能统一导入课表（拍照上传 → 自动识别 → 生成课表）

> 重构目标（用户要求）：删掉「粘贴 / 拍照」两个 tab，改为单一「智能统一导入」入口；上传课表照片后自动识别并生成课表；并按「第几节对应时间表」把每节课次匹配为具体时间段填入。

### 入口与页面
- `pages/index/index.js`：右下角 FAB 菜单第 4 项改为「**智能统一导入**」→ `goImport()` 跳转。
- `pages/import/import.{js,wxml,wxss,json}`：统一的「**上传照片**」页面，底部固定提示：
  `拍照课表在北化实践教学综合服务平台——实验教学管理——学期课表`。

### 工作流程
1. 主页右下 + 号 →「智能统一导入」→ 进入导入页。
2. 点击上传区 → `wx.chooseMedia` 拍照/选图。
   - 若已开通云端 OCR（`config.OCR_ENABLED=true`）：自动识别 → **网格重建**（`utils/grid.js`）把带坐标文字块重排成「周X 第N节 课程 @ 教室 (第X周)」→ 直接出可编辑预览。
   - 若未开通（默认离线）：选图后展示文字框，用户**粘贴/输入**课表文字（或点「📋 示例」一键填入）。
3. **自动识别**：`extractCourses` 逐行解析，识别 课程名 / 星期 / 节次 / 教师 / 教室 / **授课周次**；节次按「北化大第几节对应时间表」对齐为具体时间段。
4. **可编辑预览**：每行卡片可改 课程名/教师/教室/星期/起止节次，显示「🗓 第X-Y周」，可勾选；时间识别不出的行标「⚠ 需手动调整」。
5. **生成课表**：确认后写入 `courses` 存储（含 `weeks` 周次数组），返回主页即渲染。

### 关键文件
| 文件 | 作用 |
|------|------|
| `utils/extract.js` | 本地解析器：正则+分词提取 课程名/星期/节次/教师/教室；**新增 `extractWeeks` 识别 `(第X-Y周)/(第X周)/(第X,Y周)` 周次并剥离** |
| `utils/grid.js` | 网格重建：按坐标把 OCR 文字块重排成课表行；**支持同一格多门课拆分**（按 `(第X周)` 边界）、按单元格垂直中心匹配节次标签（覆盖上下排列的多门课） |
| `config.js` | `OCR_ENABLED` 开关 + `CLOUD_ENV` 云环境（默认关闭，离线版可用） |
| `utils/ocr.js` | `chooseImage` + `recognizeImage`（默认手动回退，开启后调云函数 OCR） |
| `pages/import/import.*` | 统一导入页（删 tab、固定底部提示、周次展示） |

### 节次 → 时间段 映射（北化大作息，已内置 `utils/courses.js`）
第1节 08:00-08:45 … 第12节 19:40-20:25（每节 45 分钟，与用户提供的「第几节对应时间表」完全一致）。
课程写入后，主页按 `startPeriod/endPeriod` 渲染具体时间（如 第3-5节 → 09:45-12:15）。

## 三、解析器能力说明（实测样例）
输入如：
```
周一 1-2节 高等数学 张明华 教学楼A301
周三 08:00-09:35 大学物理 陈志强 物理楼D302
周六 14:00-15:30 社团例会 学生会 主教楼302
```
正确产出：高等数学(周一1-2节,张明华,教学楼A301)、大学物理(周三1-2节)、社团例会(周六,时段非网格→标需手动调整)。

> 识别是**启发式**的：导入页**每行都可手改**，识别不准也能修正后导入，安全兜底。

## 四、关于图片自动识别（重要）
当前应用为**纯本地、无后端**架构。图片 OCR 需要云端能力：
- 默认 `OCR_ENABLED:false` → 选图后**手动输入/校正文字**（离线可用）。
- 想真正「拍照即识别」：在微信开发者工具开通**云开发**，部署 OCR 云函数，并在 `config.js` 填 `CLOUD_ENV`、把 `OCR_ENABLED` 改为 `true`。

## 五、验证
- 11 个 JS 文件 `node --check` 全过；`app.json` 合法 JSON；`import.wxml` 标签平衡。
- `extract.js` 逻辑单测：9 条样例（标题行被正确跳过）名称/教师/教室/星期/节次均正确；时段→节次映射正确；非网格时段正确标记需调整。

## 六、本轮回滚的两个问题（用户实测反馈）
### 1. 导入页「一片空白」→ 已修复
- **根因**：`utils/ocr.js` 第 5 行误写为 `require('./config')`，但 `config.js` 在**项目根目录**，从 `utils/` 应使用 `../config`。该路径错误导致 `ocr.js` 加载即抛 `Cannot find module`，进而 `import.js` 整模块加载失败、`Page()` 从未执行 → **导入页整页空白**。
- **为什么之前没发现**：上一轮的校验只用了 `node --check`（仅查语法，不解析模块路径），漏掉了这个运行时错误。
- **修复**：`utils/ocr.js` 改为 `require('../config')`。Node 模拟环境复跑确认模块加载 OK，解析/预览/写库全流程跑通（4 条样例正确入库）。

### 2. 仍未清掉的旧测试数据 → 已修复
- **根因**：上一轮只是"不再写入"示例数据，但用户**之前运行过、示例已写入 `wx.setStorageSync('courses')`**，本地存储会持久保留，所以仍看得到。
- **修复**：`app.js` 的 `onLaunch` 增加**一次性迁移**（标记位 `migration_done` 控制，只跑一次），启动即清除遗留的 `courses` / `events` 存储。下次启动即为空白课表，且不会误删之后录入的真实数据。

### 3. OCR 云函数示例（用户已同意）
- 新增 `cloudfunctions/ocr/index.js` + `package.json`：客户端上传图片到云存储 → 云函数下载 → 调用**腾讯云通用印刷体 OCR** → 返回纯文本。密钥走云函数环境变量（不硬编码）。
- `utils/ocr.js` 的 `recognizeImage` 在 `OCR_ENABLED=true` 时：先 `wx.cloud.uploadFile` 再 `callFunction({name:'ocr'})`。`config.js` 已注明开通云开发、填 `CLOUD_ENV`、配置环境变量的步骤。
- 默认 `OCR_ENABLED:false` → 不改任何配置也能离线使用（选图后手动输入/校正）。

## 七、解析器升级 + 一键填入示例（用户实测反馈）
用户分享了第三方便携课表（`课程名 @ 教室` 格式）的真实 10 门课，原解析器不能识别，导入页"已识别 0 条"。

### 改动
- **`utils/extract.js`**：
  - 新增 **`@` 分隔符**：行内第一个 `@` 之后整段当作教室（如 `北区 一教A-214` 多词教室）；`@` 之前的部分才参与课程名/教师分词，避免把"北区"误判成教师。
  - 新增**单节次匹配**：`第5节`/`5节`（带负向先行断言，避免误匹配 `5-6节` 的前半段）；`5节` 也加入 metaSet，防止混入课程名。
  - metaSet 区分"正则匹配的教室"与"@ 提取的教室"：前者回填 metaSet，后者不回填（已在 beforeAt 之外）。
- **`pages/import/import.{js,wxml,wxss}`**：
  - 新增 `SAMPLE_TEXT` 常量（用户真实 10 门课，按 `@` 格式排好）+ `onFillSample()` 方法。
  - 文字模式：提示文案下加 `📋 一键填入示例课表（你的 10 门课）` 蓝色链接。
  - 拍照模式：选图后、textarea 上方加 `📋 没识别到？一键填入示例课表` 链接。
  - 新增 `.fill-link` 样式。

### 使用流程（升级后）
1. 主页右下 `+` →「智能导入」→ 切到「粘贴文字」。
2. 点 `📋 一键填入示例课表` → 文本框自动填入 10 门课。
3. 点 `🔍 解析课表` → 看到 10 张预览卡片（每张可改/勾选）。
4. 点 `＋ 导入 10 门课程` → 写入课表，返回主页即可看到。

### 验证
- 解析器 61 条断言全过：10 条课的星期、起止节次下标、课程名（含 `高等数学b(1)` / `无机化学实验(6)` / 长名称）、教室（`@` 多词）全部正确；单节次 `5节` 正确映射到第 5 节。
- 12 个 JS 文件 `node --check` 全过；Node 模拟环境下导入页加载 OK、`onFillSample` 填入 10 行、`parseText` 产出 10 条候选。

## 八、拍照自动识别打通（云开发 + 网格重建）
用户确认可尝试云开发，目标是「拍张课表照片 → 自动出字 → 自动排版成可编辑课表」。难点：课表是**网格图**，OCR 直接吐出的文字是「按阅读顺序乱排」的，必须把带坐标的文字块按行列还原。

### 新增 / 改动
- **`cloudfunctions/ocr/index.js`**（升级）：`GeneralBasicOCR` 现在**额外返回每个文字块的 `Polygon` 坐标**（不只是拼接文字）。客户端据此做网格重建。
- **`utils/grid.js`**（新增）：`reconstructSchedule(detections)` —— 网格重建算法：
  1. 按 `cy` 自适应聚成行；2. 找含星期的表头行、建立 7 列 x 边界；3. 每行左列取节次标注；4. 按列取出单元格，拼成 `周X 第N节 课程名 @ 教室`。
  5. 退化保护：列数 < 2 或找不到星期列时返回空，交「原始文字」解析兜底。
- **`utils/ocr.js`**：`recognizeImage` 现返回 `{ text, detections, source }`。
- **`pages/import/import.{js,wxml,wxss}`**：拍照识别后，**优先用网格重建行自动解析预览**（带「📷 已识别 N 门」提示）；识别不准时提供 `✏️ 改用图片原始文字手动核对` 回退按钮。

### 验证
- 13 个 JS 文件 `node --check` 全过。
- **网格重建单测**：用合成坐标模拟 7 列星期网格（含 `@` 格式、单节次、长课程名、周日那门），重建出 10 行且**每行课程名/星期/节次/教室全部正确**。
- **导入页全流程模拟**：模拟拍照 OCR 返回坐标 → 重建 → 解析预览产出 3 条候选（星期/起止节次正确）→ `onUseRaw` 回退正常。

### 开通「拍照自动识别」4 步（零基础可跟）
1. 微信开发者工具顶部点「☁ 云开发」→ 开通（选按量计费，有免费额度）→ 复制**环境 ID**，填到 `config.js` 的 `CLOUD_ENV`。
2. 右键本项目 `cloudfunctions/ocr` 目录 →「上传并部署：云端安装依赖」（自动装 `wx-server-sdk` + 腾讯云 OCR SDK）。
3. 准备腾讯云密钥：登录 `console.cloud.tencent.com` → 访问管理 → API 密钥管理 → 新建得到 `SecretId/SecretKey`；再到**云开发控制台 → 云函数 `ocr` → 配置 → 环境变量**添加 `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`。
   - 注意：腾讯云「文字识别 OCR」服务要单独**开通**（有免费额度），否则调用报错。
4. 把 `config.js` 的 `OCR_ENABLED` 改为 `true`，**重新编译**小程序。进导入页 →「拍照/上传」选课表照片 → 自动识别并生成可编辑预览。

> 提示：云开发需小程序用**真实 AppID**（不能用测试号），且你是该云环境创建者。若识别偶有偏差，预览卡片每行都可手改/勾选，再导入即可。

## 九、手机端一键清空（与电脑端统一空白状态）
**问题**：用户在手机上测试时导入了 10 门课，与开发者工具（电脑端）空白状态不一致。
**根因**：微信小程序本地存储 `wx.setStorageSync` **按设备隔离**——开发者工具一份、手机一份，互不同步。清理逻辑只清空了电脑端，手机上的真实录入数据（刻意受 `migration_done` 标记保护）保留着。

**改动**：
- `pages/index/index.js`：新增 `resetAllData()` —— 危险确认弹窗后 `removeStorageSync('courses'/'events'/'memos'/'smart_usage')`；保留 `slots`（时段配置）与 `semesterStart`（学期起始），并 `setData({currentWeek:1})` + `loadSchedule()` + toast。
- `pages/index/index.wxml`：~~在「智能排课建议」面板底部（空闲分析列表之后）加 `.smart-reset-wrap`：「🗑 清空全部课表数据」红色按钮~~ **（已于第十节移入右下角 FAB，见下方）。**
- `pages/index/index.wxss`：对应样式，并在 `@media(min-width:550px)` 补大屏适配。

**用法**：见第十节 —— 主页右下角 ＋ 号 → 菜单最末项「🗑 清空全部课表」→ 确认 → 手机即变空白，与电脑端一致。

**不依赖新按钮的手动清法**：手机微信里长按该小程序 → 删除/移除（会清空其本地存储）→ 重新真机预览即空白。

**验证**：`index.js` 语法通过；`resetAllData` 模拟执行 8 项断言全过（四键删除、slots/semesterStart 保留、周次重置为 1）；`index.wxml` 标签平衡、新按钮与 `bindtap` 存在。

## 十、三项交互优化（课程删除 / 滑动切周 / 清空入口前移）

### 1. 课程删除：支持「仅删除该节」或「删除整门」（处理冲突）
- `pages/index/index.js`：
  - `showCourseDetail` 详情弹窗的「编辑备注」按钮改为「**管理**」→ 调 `showCourseManage`。
  - `showCourseManage`：操作面板列出 `编辑备注` / `仅删除本周（第X周）` / `删除整门课程` 三项。
  - `deleteCourseWeek`：从课程 `weeks` 数组中剔除当前周 —— 仅让该课**当前周这一节**消失，其余周次保留（用于单周冲突调整）。若剔除后 `weeks` 为空，则提示并整门删除。
  - `confirmDelete`（原有，整门删除 + 二次确认）保留，长按需删除依旧可用。
- **数据模型契合**：每门课是单条对象 + `weeks` 周次数组，逐周剔除即实现「单节/整门」的颗粒度区分。

### 2. 周次滑动手势（保留左上角按钮）
- `pages/index/index.wxml`：`scroll-view` 增加 `bindtouchstart="onTouchStart"` `bindtouchend="onTouchEnd"`。
- `pages/index/index.js`：`onTouchStart` 记录起点；`onTouchEnd` 判定 —— 横向位移 ≥ 50px 且以横向为主（`|dx|>|dy|`）时，`dx<0` 切**下一周**、`dx>0` 切**上一周**（复用 `nextWeek/prevWeek`，到边界自动 toast）。
- `pages/index/index.wxml/.wxss`：顶部加一条轻量提示「← 左右滑动屏幕切换上一周 / 下一周 →」提升可发现性，并同步调整 `scroll-view` 高度与该提示的大屏适配。

### 3. 一键清空入口前移（从「智能」面板移入右下角 FAB）
- `pages/index/index.js`：`onFabTap` 菜单新增第 5 项「🗑 清空全部课表」，点击调 `resetAllData()`。
- `pages/index/index.wxml`：删除「智能排课建议」面板底部的 `smart-reset-wrap` 整块。
- `pages/index/index.wxss`：删除 `.smart-reset-*` 相关样式（含 `@media` 覆盖）。

**验证**：`node --check` 通过；`grep` 确认无 `smart-reset` 残留；`index.wxml` 标签平衡；FAB/手势/课程管理相关方法均已正确绑定。

## 十一、打开即定位「今天」所在周（不再从第1周滑起）
**需求**：一扫进主页就停在当前日期所在的周，免去从第 1 周手动滑到现在的麻烦。

**改动**：
- `pages/index/index.js`：
  - `onLoad` 在算完 `week1MondayMs`（学期第 1 周周一）后，调用新增的 `computeCurrentWeek(week1MondayMs)` 算出当前周并写入 `currentWeek`，`loadSchedule` 即渲染该周。
  - 新增 `computeCurrentWeek`：`dayDiff = floor((今天 - 第1周周一)/天)`，`week = floor(dayDiff/7)+1`，并夹在 `1 ~ totalWeeks` 之间（未设学期起始时第1周即本周 → 显示第1周=当前周；学期起始在未来则夹到 1，远超则夹到 20）。
  - `resetAllData` 清空后定位改为 `computeCurrentWeek(...)`（保持与「打开即今天」一致的落点），不再硬编码第 1 周。
- 注意：`onShow` 不重算周次，保留用户手动翻周后的位置（仅首次 `onLoad` 与清空时跳到今天）。

**验证**：`node --check` 通过；4 组模拟（本周/8周前=9/超界=20/未来=1）结果均正确。

## 十二、FAB 移除「写便签」+ 提醒页改为页内添加待办（不跳转备忘）
**需求**：
1. 右下角 ＋ 号菜单里的「写便签」删掉。
2. 「提醒」页的「待办事项」支持直接添加待办提醒，不再跳转到备忘录页面。

**改动**：
- `pages/index/index.js`：
  - `onFabTap` 菜单由 `['添加课程','添加活动(开会/讲座)','写便签','智能统一导入','🗑 清空全部课表']` 改为 `['添加课程','添加活动(开会/讲座)','智能统一导入','🗑 清空全部课表']`，索引 0/1/2/3 对应 课程/活动/导入/清空。
  - 删除不再被调用的便签快捷方法 `quickMemoPickDay` / `quickMemoPickSlot` / `quickMemoToSlot`（关联课表的便签仍可在「备忘录」页添加，主页「备忘」工具按钮保留）。
- `pages/remind/remind.js`：
  - data：删 `undoneMemos`，新增 `todoAll`（全部待办，未完成在前、已完成沉底）、`showTodoForm`、`todoInput`。
  - `refresh`：把 `undoneMemos`（仅取前3条未完成）改为构造 `todoAll` 全量排序列表。
  - 新增 `toggleTodoForm` / `onTodoInput` / `addTodo`（页内写一条待办直接入 `memos`）/ `toggleTodo`（点击勾选/取消完成）/ `deleteTodo`（长按二次确认删除）。
  - 删除 `goMemo`（不再跳转备忘录）。
- `pages/remind/remind.wxml`：「待办事项」卡片改为：标题右侧「＋ 添加」(toggle 输入条)；输入条含 `input` + 「添加」按钮；列表渲染 `todoAll`，每行可点击勾选、长按删除；空态文案更新。移除原「查看全部 ›」跳转按钮。
- `pages/remind/remind.wxss`：新增 `.todo-form/.todo-input/.todo-add-btn/.todo-add-text/.todo-check/.todo-check-on/.todo-check-icon/.todo-row-done/.todo-text-done` 样式，旧 `.todo-dot` 替换为可勾选圆圈；保留 `.todo-row/.todo-text` 基础样式。

**验证**：`node --check` 通过；`grep` 确认 remind 内无 `undoneMemos/goMemo` 残留、index 内无 `写便签/quickMemo*` 残留；`remind.wxml`/`index.wxml` 标签平衡。

## 十三、新增「第二课堂」成绩评定模块（首页双卡片 + 五大板块 + 进度条 + 记录）
**需求**：首页并排「日程表」「第二课堂」两卡片；第二课堂页含五板块（道德与思想/学术与创新/体育与身心健康/美学与人文素养/劳动与社会实践），每板块分基础/拓展，列出每条任务及评分准则、任务内容、分数上限；每条任务挂可拖动进度条（标注上限）；点任务进记录页可写文字+传图片。

**新增文件**：
- `utils/secondClass.js`：依据 2026 级本科生手册《第二课堂成绩评定实施办法》提取的数据模型。5 板块，共 40 条任务（基础/拓展），每条含 `clause/title/criteria/content/cap`；板块 `totalMax/basicMax/extMax` 取自办法第四条（道德180/144/36、学术120/96/24、体育·美学·劳动各100/80/20、总满分600）。含竞赛/体育/美育分值表（写入 criteria 文本）。导出 `SECTIONS/getSection/findTask`。
- `utils/scStore.js`：本地存储助手，键 `sc_scores`(任务→分值)、`sc_records`(任务→记录数组)。
- `pages/home/*`：小程序新入口，渐变背景 + 并排两卡片（日程表→/pages/index，第二课堂→/pages/second-class），第二课堂卡显示「已得 X/600 分」进度。
- `pages/second-class/*`：五板块列表卡片，显示各板块已得/上限进度与任务数。
- `pages/section-detail/*`：板块详情，顶部总分进度；基础/拓展分组，每条任务卡含条款徽标、评分准则、任务内容、`<slider>`(0~cap) + 已得/上限标注；拖动实时存分值并更新分组与总分；点任务条头部进记录页。
- `pages/task-record/*`：任务记录页，textarea 写文字 + `wx.chooseMedia` 选图（用 `FileSystemManager.saveFileSync` 持久化到 USER_DATA_PATH）+ 列表展示历史记录与图片预览（`wx.previewImage`）、删除。
- `app.json`：pages 数组新增上述 4 页并置顶，`pages/home/home` 成为启动页；原 `pages/index` 课表页保持不变、经首页「日程表」跳转。

**交互要点**：进度条用原生 `<slider>`（可手动拖动）满足「可手动拖动的完成进度条」；记录页图片经 `saveFileSync` 落本地长期路径，避免临时文件失效。

**验证**：6 个新 JS `node --check` 全过；4 个新 WXML 标签平衡；`app.json` 合法；`secondClass.js` 数据自检（40 条任务、各板块上限与办法一致、`findTask`/`getSection` 正常）。

## 十四、第二课堂重构：三级导航 + 记账式加分（去掉"第几条"编号）
**需求迭代**：进入板块后先呈现「基础评定」「拓展评定」两个模块，再点进去才列出分开的每一条任务；列表不显示"第几条"编号；每条首屏写主要任务内容；点任务条进入详情看更详细的评分标注；记录部分上传内容后要有「加分记录填写」（类微信记账），每条记录显示加多少的标识。

**改动**：
- `utils/scStore.js`：改为**记录驱动计分**。删除旧的 `getScores/setScore/getScore`（slider 直写分值），改为 `getTaskScore/getModuleScore/getSectionScore/getTotalScore/addRecord/deleteRecord/getTaskRecords/getRecords`。每条记录带 `score`，任务实得 = 各记录加分之和并封顶该任务 `cap`；模块/板块/总分均随之累加（模块按 `basicMax/extMax` 封顶）。
- `pages/section-detail/*`：由"直接列出全部任务+滑块"改为**只展示两个模块卡**（基础评定/拓展评定），各卡显示已得/上限进度条，点卡 → `module-tasks`。
- 新增 `pages/module-tasks/*`：模块任务列表。每条任务卡显示 `title`（标题）+ `content`（主要任务内容，**不显示 clause 编号**）+ 已得/上限角标 + 进度；点任务 → `task-record`。
- `pages/task-record/*`：改为**任务详情 + 记账式加分**。详情含：任务头（已得/上限）、「任务内容」简述、「评分标注（详细）」(criteria)；下方「新建记录」表单含 textarea + 选图 + **「本次加分」数字输入**；历史记录以流水展示，每条右侧显示绿色「+X 分」记账标识；记录末尾显示「本任务已累计加分 X / 上限 分」汇总条。保存时按 `cap` 自动封顶，删除记录同步撤销加分。
- `pages/home/home.js` 与 `pages/second-class/second-class.js`：由 `getScores()` 改为调用新计分 API（`getTotalScore`/`getSectionScore`）。
- `app.json`：pages 新增 `pages/module-tasks/module-tasks`。

**说明**：进度条改为只读展示（已得/上限），实际打分改由「加分记录」逐笔累加，贴合"像微信记账一样"的诉求；原滑块录入方式已移除。`secondClass.js` 中 `clause` 字段保留于数据但界面不再渲染。

**验证**：7 个相关 JS `node --check` 全过；`app.json` 合法；WXML 标签平衡；`grep` 确认四页面 WXML 无 `clause` 残留；Node 模拟 `wx` 存储跑通计分逻辑（任务封顶、模块求和、删除重算均正确）。

## 十四、分值表改为结构化表格渲染
**需求**：资料里的「分值表」（学科竞赛/体育竞赛/美育比赛）原以纯文本塞进评分准则，现要求以表格形式直接放在对应任务的评分标注处。

**改动**：
- `utils/secondClass.js`：将三处任务（academic-20 竞赛获奖、sports-27 体育竞赛获奖、aesthetic-34 美育类比赛获奖）的 `criteria` 去掉末尾表文本，新增 `criteriaTable: { caption, headers, rows:[{cells:[...]}] }`。表头与数据列对齐校验通过（学科 6 列 / 体育 7 列 / 美育 7 列，各 4 行）。美育原稿「国·国」按国际级与国家级同分处理。
- `pages/task-record/task-record.wxml`：「评分标注（详细）」box 内，在 criteria 文本下方用 `wx:if="{{task.criteriaTable}}"` 渲染 view 模拟表格（表标题 + 表头行 + 数据行，首列「奖项」加粗左对齐，其余列等宽居中）。
- `pages/task-record/task-record.wxss`：新增 `.tr-table/.tr-table-cap/.tr-tr/.tr-tr-head/.tr-td/.tr-td-first` 样式（边框、表头底色、首列加宽加粗、列分隔线）。

**验证**：`node --check` 通过；3 张表列对齐校验（学科6/体育7/美育7 列，各4行）；`task-record.wxml` 标签平衡；含 `criteriaTable` 任务数为 3。
